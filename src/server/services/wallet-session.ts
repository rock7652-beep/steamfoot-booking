/**
 * 單堂明細（WalletSession）service
 *
 * 設計原則：
 *  - 所有函式都接受 Prisma transaction client (`tx`)，以便呼叫端把 session 變動
 *    跟 booking / wallet update 包在同一個原子交易內。
 *  - `CustomerPlanWallet.remainingSessions` 仍為 cached counter，由本檔案唯一同步：
 *      remainingSessions ≡ count(AVAILABLE) + count(RESERVED)
 *    亦即「尚未使用且未被註銷」的堂數。既有 25 處 UI 讀取點不需改。
 *  - allocate 用 CAS（updateMany WHERE status=AVAILABLE）防並行雙寫。
 *  - 補課預約（booking.isMakeup = true）不消耗 wallet session — 不會呼叫本服務。
 *
 * 狀態機：
 *   AVAILABLE ──allocateSession──▶ RESERVED
 *   RESERVED  ──releaseSession──▶ AVAILABLE
 *   RESERVED  ──completeSession──▶ COMPLETED
 *   COMPLETED ──uncompleteSession──▶ RESERVED
 *   AVAILABLE ──voidAvailableSession──▶ VOIDED  (不可逆，店長手動)
 */

import type { Prisma, WalletSession } from "@prisma/client";

type Tx = Prisma.TransactionClient;

// ──────────────────────────────────────────────────────────────
// 內部：刷新 wallet.remainingSessions + status
// ──────────────────────────────────────────────────────────────

async function refreshWalletCounter(tx: Tx, walletId: string): Promise<void> {
  // remainingSessions = AVAILABLE + RESERVED
  const grouped = await tx.walletSession.groupBy({
    by: ["status"],
    where: { walletId },
    _count: { _all: true },
  });

  let available = 0;
  let reserved = 0;
  let total = 0;
  for (const row of grouped) {
    total += row._count._all;
    if (row.status === "AVAILABLE") available = row._count._all;
    if (row.status === "RESERVED") reserved = row._count._all;
  }
  const remaining = available + reserved;

  // 若所有堂都不可用（COMPLETED + VOIDED 占滿）→ USED_UP
  // 若 wallet 已是 EXPIRED / CANCELLED 由其他流程控制，不在此覆蓋。
  const wallet = await tx.customerPlanWallet.findUnique({
    where: { id: walletId },
    select: { status: true },
  });
  if (!wallet) return;

  const nextStatus =
    wallet.status === "EXPIRED" || wallet.status === "CANCELLED"
      ? wallet.status
      : remaining <= 0 && total > 0
      ? "USED_UP"
      : "ACTIVE";

  await tx.customerPlanWallet.update({
    where: { id: walletId },
    data: { remainingSessions: remaining, status: nextStatus },
  });
}

// ──────────────────────────────────────────────────────────────
// seedWalletSessions — wallet 開通時建立 N 個 AVAILABLE row
// ──────────────────────────────────────────────────────────────

export async function seedWalletSessions(
  tx: Tx,
  walletId: string,
  totalSessions: number
): Promise<void> {
  if (totalSessions <= 0) return;
  await tx.walletSession.createMany({
    data: Array.from({ length: totalSessions }, (_, i) => ({
      walletId,
      sessionNo: i + 1,
      status: "AVAILABLE" as const,
    })),
  });
  // 不呼叫 refreshWalletCounter — wallet 建立時 remainingSessions 已由呼叫端設好
}

// ──────────────────────────────────────────────────────────────
// allocateSession — 預約建立時，挑最小 sessionNo 的 AVAILABLE 改為 RESERVED
// ──────────────────────────────────────────────────────────────

export async function allocateSession(
  tx: Tx,
  walletId: string,
  bookingId: string
): Promise<WalletSession | null> {
  // 先找最小 sessionNo 的 AVAILABLE
  const candidate = await tx.walletSession.findFirst({
    where: { walletId, status: "AVAILABLE" },
    orderBy: { sessionNo: "asc" },
    select: { id: true },
  });
  if (!candidate) {
    // 沒有 AVAILABLE row。可能情境：
    //   1) wallet 已在 PR1 backfill 範圍但全部用完 → 呼叫端 booking 數量檢查應已擋下，但這裡保險回 null
    //   2) wallet 是「PR1 deploy 前建立、且 backfill 尚未跑」的舊資料 → 呼叫端會 fallback 走舊計數邏輯
    return null;
  }

  // CAS：只有 status 仍為 AVAILABLE 才改（防並行 double-allocate）
  const result = await tx.walletSession.updateMany({
    where: { id: candidate.id, status: "AVAILABLE" },
    data: { status: "RESERVED", bookingId, reservedAt: new Date() },
  });
  if (result.count === 0) {
    // 被別人搶先了 → 遞迴重試
    return allocateSession(tx, walletId, bookingId);
  }

  await refreshWalletCounter(tx, walletId);
  return tx.walletSession.findUnique({ where: { id: candidate.id } });
}

// ──────────────────────────────────────────────────────────────
// releaseSession — 取消預約 / 不扣堂未到 → RESERVED → AVAILABLE
// ──────────────────────────────────────────────────────────────

export async function releaseSession(tx: Tx, bookingId: string): Promise<boolean> {
  const session = await tx.walletSession.findFirst({
    where: { bookingId, status: "RESERVED" },
    select: { id: true, walletId: true },
  });
  if (!session) return false; // 沒有對應 RESERVED row（補課 / 歷史 booking） → no-op

  await tx.walletSession.update({
    where: { id: session.id },
    data: { status: "AVAILABLE", bookingId: null, reservedAt: null },
  });
  await refreshWalletCounter(tx, session.walletId);
  return true;
}

// ──────────────────────────────────────────────────────────────
// completeSession — 出席 / NO_SHOW(DEDUCTED) → RESERVED → COMPLETED
// ──────────────────────────────────────────────────────────────

export async function completeSession(
  tx: Tx,
  bookingId: string,
  completedAt: Date = new Date()
): Promise<boolean> {
  const session = await tx.walletSession.findFirst({
    where: { bookingId, status: "RESERVED" },
    select: { id: true, walletId: true },
  });
  if (!session) return false; // 補課 / 歷史 booking → no-op

  await tx.walletSession.update({
    where: { id: session.id },
    data: { status: "COMPLETED", completedAt },
  });
  await refreshWalletCounter(tx, session.walletId);
  return true;
}

// ──────────────────────────────────────────────────────────────
// uncompleteSession — revertBookingStatus 從 COMPLETED → PENDING 時呼叫
//                     COMPLETED → RESERVED（清空 completedAt）
// ──────────────────────────────────────────────────────────────

export async function uncompleteSession(tx: Tx, bookingId: string): Promise<boolean> {
  const session = await tx.walletSession.findFirst({
    where: { bookingId, status: "COMPLETED" },
    select: { id: true, walletId: true },
  });
  if (!session) return false;

  await tx.walletSession.update({
    where: { id: session.id },
    data: { status: "RESERVED", completedAt: null },
  });
  await refreshWalletCounter(tx, session.walletId);
  return true;
}

// ──────────────────────────────────────────────────────────────
// reReserveSession — revertBookingStatus 從 CANCELLED / NO_SHOW(NOT_DEDUCTED)
//                    → PENDING 時呼叫；該 booking 之前是 RESERVED 但已被 release。
//                    需重新挑一個 AVAILABLE 並掛 bookingId。
// ──────────────────────────────────────────────────────────────

export async function reReserveSession(
  tx: Tx,
  walletId: string,
  bookingId: string
): Promise<WalletSession | null> {
  return allocateSession(tx, walletId, bookingId);
}

// ──────────────────────────────────────────────────────────────
// voidAvailableSession — 店長手動註銷單堂（AVAILABLE → VOIDED，不可逆）
//
// Guards：
//   - 必須 status=AVAILABLE（COMPLETED/RESERVED/VOIDED 拒絕）
//   - voidReason 必填
//   - 用 CAS 防並行重複註銷
// ──────────────────────────────────────────────────────────────

export class WalletSessionError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "NOT_AVAILABLE"
      | "ALREADY_VOIDED"
      | "VALIDATION",
    message: string
  ) {
    super(message);
    this.name = "WalletSessionError";
  }
}

export async function voidAvailableSession(
  tx: Tx,
  params: { sessionId: string; voidReason: string; voidedByStaffId: string }
): Promise<{ walletId: string; sessionNo: number }> {
  const { sessionId, voidReason, voidedByStaffId } = params;
  const reason = voidReason.trim();
  if (!reason) {
    throw new WalletSessionError("VALIDATION", "註銷原因不能為空");
  }

  const existing = await tx.walletSession.findUnique({
    where: { id: sessionId },
    select: { status: true, walletId: true, sessionNo: true },
  });
  if (!existing) {
    throw new WalletSessionError("NOT_FOUND", "找不到此堂明細");
  }
  if (existing.status === "VOIDED") {
    throw new WalletSessionError("ALREADY_VOIDED", "此堂已註銷");
  }
  if (existing.status !== "AVAILABLE") {
    throw new WalletSessionError(
      "NOT_AVAILABLE",
      existing.status === "RESERVED"
        ? "此堂已綁定預約，請先取消預約後再註銷"
        : "此堂已使用，無法註銷"
    );
  }

  // CAS：只有 status 仍為 AVAILABLE 才改
  const result = await tx.walletSession.updateMany({
    where: { id: sessionId, status: "AVAILABLE" },
    data: {
      status: "VOIDED",
      voidedAt: new Date(),
      voidReason: reason,
      voidedByStaffId,
    },
  });
  if (result.count === 0) {
    // 被別人搶先：重新讀取後丟對應錯誤
    const reread = await tx.walletSession.findUnique({
      where: { id: sessionId },
      select: { status: true },
    });
    if (reread?.status === "VOIDED") {
      throw new WalletSessionError("ALREADY_VOIDED", "此堂已註銷");
    }
    throw new WalletSessionError("NOT_AVAILABLE", "狀態已變更，無法註銷");
  }

  await refreshWalletCounter(tx, existing.walletId);
  return { walletId: existing.walletId, sessionNo: existing.sessionNo };
}

// ──────────────────────────────────────────────────────────────
// reconcileForManualAdjust — adjustRemainingSessions（管理員手動調整剩餘堂數）
// 配套同步 session row：
//   - 新堂數 > 現有 AVAILABLE+RESERVED：補 AVAILABLE row（sessionNo 接續）
//   - 新堂數 < 現有 AVAILABLE+RESERVED：voidAvailable 多出的部分（從最大 sessionNo 往回 void）
//   - 不可低於 RESERVED 數（會丟錯，請呼叫端先取消預約）
//
// 目的：保持 remainingSessions == count(AVAILABLE) + count(RESERVED) 不變式。
// 不更新 wallet.totalSessions（保留呼叫端原有語意）。
// ──────────────────────────────────────────────────────────────

export async function reconcileForManualAdjust(
  tx: Tx,
  params: { walletId: string; newRemaining: number; voidedByStaffId: string | null }
): Promise<void> {
  const { walletId, newRemaining, voidedByStaffId } = params;
  const sessions = await tx.walletSession.findMany({
    where: { walletId },
    orderBy: { sessionNo: "asc" },
    select: { id: true, sessionNo: true, status: true },
  });

  const reserved = sessions.filter((s) => s.status === "RESERVED");
  const available = sessions.filter((s) => s.status === "AVAILABLE");
  const currentTracked = available.length + reserved.length;

  if (newRemaining < reserved.length) {
    throw new WalletSessionError(
      "VALIDATION",
      `新剩餘堂數 (${newRemaining}) 小於已預約堂數 (${reserved.length})，請先取消預約後再調整`
    );
  }

  if (newRemaining === currentTracked) return; // 無需動

  if (newRemaining > currentTracked) {
    const toAdd = newRemaining - currentTracked;
    const maxSessionNo = sessions.reduce((m, s) => Math.max(m, s.sessionNo), 0);
    await tx.walletSession.createMany({
      data: Array.from({ length: toAdd }, (_, i) => ({
        walletId,
        sessionNo: maxSessionNo + i + 1,
        status: "AVAILABLE" as const,
      })),
    });
  } else {
    const toVoid = currentTracked - newRemaining;
    const candidates = [...available]
      .sort((a, b) => b.sessionNo - a.sessionNo) // 從最大 sessionNo 往回 void
      .slice(0, toVoid);
    if (candidates.length < toVoid) {
      throw new WalletSessionError(
        "VALIDATION",
        "AVAILABLE 堂數不足以調整，請先取消預約或聯絡技術支援"
      );
    }
    await tx.walletSession.updateMany({
      where: { id: { in: candidates.map((c) => c.id) }, status: "AVAILABLE" },
      data: {
        status: "VOIDED",
        voidedAt: new Date(),
        voidReason: "管理員手動調整剩餘堂數",
        voidedByStaffId,
      },
    });
  }
  await refreshWalletCounter(tx, walletId);
}
