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
 *  - 一筆 booking 可佔用 N 個 WalletSession（multi-person, people>1）；
 *    所有 booking-bound helper 都對該 booking 的全部對應 row 操作。
 *
 * 狀態機（per-session row）：
 *   AVAILABLE ──allocateSessions──▶ RESERVED
 *   RESERVED  ──releaseSessions──▶ AVAILABLE
 *   RESERVED  ──completeSessions──▶ COMPLETED
 *   COMPLETED ──uncompleteSessions──▶ RESERVED
 *   AVAILABLE ──voidAvailableSession──▶ VOIDED  (不可逆，店長手動)
 */

import type { Prisma, WalletSession } from "@prisma/client";
import { compareWalletByFEFO } from "@/lib/wallet-sort";

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
// allocateSessions — 預約建立時，挑最小 N 個 AVAILABLE 改為 RESERVED
//
// 回傳 { allocated }：
//   - allocated === count：完整配到（success）
//   - allocated === 0    ：沒有 AVAILABLE row（legacy wallet 無 ledger） → 呼叫端 fallback
//   - 0 < allocated < count：呼叫端 capacity 檢查失靈，丟錯 → tx rollback
// ──────────────────────────────────────────────────────────────

export async function allocateSessions(
  tx: Tx,
  walletId: string,
  bookingId: string,
  count: number
): Promise<{ allocated: number }> {
  if (!Number.isInteger(count) || count <= 0) {
    throw new WalletSessionError("VALIDATION", `allocateSessions count 必須為正整數，收到 ${count}`);
  }

  const reservedAt = new Date();
  let allocated = 0;
  // 最多重試 count*2 次以容忍並行搶占；正常 1 次完成
  const maxAttempts = count * 2 + 5;
  for (let attempt = 0; attempt < maxAttempts && allocated < count; attempt++) {
    const candidates = await tx.walletSession.findMany({
      where: { walletId, status: "AVAILABLE" },
      orderBy: { sessionNo: "asc" },
      take: count - allocated,
      select: { id: true },
    });
    if (candidates.length === 0) break; // 沒得選 → 退出，外層判斷

    const result = await tx.walletSession.updateMany({
      where: { id: { in: candidates.map((c) => c.id) }, status: "AVAILABLE" },
      data: { status: "RESERVED", bookingId, reservedAt },
    });
    allocated += result.count;
  }

  if (allocated > 0 && allocated < count) {
    // 部分配到 — 呼叫端 capacity check 失靈或並行嚴重；交由 transaction rollback
    throw new WalletSessionError(
      "NOT_AVAILABLE",
      `所需 ${count} 堂只能配到 ${allocated} 堂，請先確認剩餘堂數`
    );
  }

  if (allocated > 0) {
    await refreshWalletCounter(tx, walletId);
  }
  return { allocated };
}

// ──────────────────────────────────────────────────────────────
// releaseSessions — 取消預約 / 不扣堂未到 → RESERVED → AVAILABLE
//                   對該 booking 的全部 RESERVED row 操作
// ──────────────────────────────────────────────────────────────

export async function releaseSessions(
  tx: Tx,
  bookingId: string
): Promise<{ released: number }> {
  const sessions = await tx.walletSession.findMany({
    where: { bookingId, status: "RESERVED" },
    select: { id: true, walletId: true },
  });
  if (sessions.length === 0) return { released: 0 }; // 補課 / legacy → no-op

  // multi-wallet：一筆 booking 可能跨多張 wallet（FEFO split），全部 release
  const walletIds = [...new Set(sessions.map((s) => s.walletId))];
  const result = await tx.walletSession.updateMany({
    where: { bookingId, status: "RESERVED" },
    data: { status: "AVAILABLE", bookingId: null, reservedAt: null },
  });
  for (const walletId of walletIds) {
    await refreshWalletCounter(tx, walletId);
  }
  return { released: result.count };
}

// ──────────────────────────────────────────────────────────────
// completeSessions — 出席 / NO_SHOW(DEDUCTED) → RESERVED → COMPLETED
//                    對該 booking 的全部 RESERVED row 操作
// ──────────────────────────────────────────────────────────────

export async function completeSessions(
  tx: Tx,
  bookingId: string,
  completedAt: Date = new Date()
): Promise<{
  completed: number;
  /** 個別 session 的 walletId + sessionNo — 呼叫端用來建 per-wallet SESSION_DEDUCTION 交易 */
  items: Array<{ walletId: string; sessionNo: number }>;
}> {
  const sessions = await tx.walletSession.findMany({
    where: { bookingId, status: "RESERVED" },
    select: { id: true, walletId: true, sessionNo: true },
    orderBy: [{ walletId: "asc" }, { sessionNo: "asc" }],
  });
  if (sessions.length === 0) return { completed: 0, items: [] };

  // multi-wallet：一筆 booking 可能跨多張 wallet（FEFO split），全部 COMPLETE
  const walletIds = [...new Set(sessions.map((s) => s.walletId))];
  const result = await tx.walletSession.updateMany({
    where: { bookingId, status: "RESERVED" },
    data: { status: "COMPLETED", completedAt },
  });
  for (const walletId of walletIds) {
    await refreshWalletCounter(tx, walletId);
  }
  return {
    completed: result.count,
    items: sessions.map((s) => ({ walletId: s.walletId, sessionNo: s.sessionNo })),
  };
}

// ──────────────────────────────────────────────────────────────
// uncompleteSessions — revertBookingStatus 從 COMPLETED → PENDING 時呼叫
//                      對該 booking 的全部 COMPLETED row：COMPLETED → RESERVED
// ──────────────────────────────────────────────────────────────

export async function uncompleteSessions(
  tx: Tx,
  bookingId: string
): Promise<{ uncompleted: number }> {
  const sessions = await tx.walletSession.findMany({
    where: { bookingId, status: "COMPLETED" },
    select: { id: true, walletId: true },
  });
  if (sessions.length === 0) return { uncompleted: 0 };

  // multi-wallet：一筆 booking 可能跨多張 wallet，全部 UNCOMPLETE
  const walletIds = [...new Set(sessions.map((s) => s.walletId))];
  const result = await tx.walletSession.updateMany({
    where: { bookingId, status: "COMPLETED" },
    data: { status: "RESERVED", completedAt: null },
  });
  for (const walletId of walletIds) {
    await refreshWalletCounter(tx, walletId);
  }
  return { uncompleted: result.count };
}

// ──────────────────────────────────────────────────────────────
// reReserveSessions — revertBookingStatus 從 CANCELLED / NO_SHOW(NOT_DEDUCTED)
//                     → PENDING 時呼叫；該 booking 之前是 RESERVED N 堂但已被 release。
//                     需重新挑 N 個 AVAILABLE 並掛 bookingId。
// ──────────────────────────────────────────────────────────────

export async function reReserveSessions(
  tx: Tx,
  walletId: string,
  bookingId: string,
  count: number
): Promise<{ reReserved: number }> {
  const { allocated } = await allocateSessions(tx, walletId, bookingId, count);
  return { reReserved: allocated };
}

// ──────────────────────────────────────────────────────────────
// allocateSessionsFefo — 跨 wallet FEFO 分配
//
// 場景：multi-person booking (people>1) 一張 wallet 不夠分配整 people 數時，
// 依 FEFO（最早到期）順序橫跨多張 wallet 分配，把每張 wallet 的 AVAILABLE 用到上限再換下一張。
//
// 排序：preferredWalletId（呼叫端指定）排最前 → 其餘依 compareWalletByFEFO（expiryDate ASC,
// createdAt ASC, id ASC）。
//
// 回傳：
//   - allocations: 每張 wallet 實際配到的堂數（沒配到的 wallet 不入列）
//   - primaryWalletId: 第一張被使用的 wallet id；callers 拿來寫 booking.customerPlanWalletId
//
// Error：
//   - 跨 wallet 總 AVAILABLE+RESERVED 不足 count → throw NOT_AVAILABLE
//   - 部分配到後仍不足（例：legacy wallet 無 ledger 被略過）→ throw NOT_AVAILABLE，tx rollback
// ──────────────────────────────────────────────────────────────

export type FefoCandidateWallet = {
  id: string;
  expiryDate: Date | null;
  createdAt: Date;
  remainingSessions: number;
};

export async function allocateSessionsFefo(
  tx: Tx,
  args: {
    candidates: readonly FefoCandidateWallet[];
    bookingId: string;
    count: number;
    preferredWalletId?: string | null;
  }
): Promise<{
  allocations: Array<{ walletId: string; count: number }>;
  primaryWalletId: string | null;
}> {
  const { candidates, bookingId, count, preferredWalletId } = args;
  if (!Number.isInteger(count) || count <= 0) {
    throw new WalletSessionError(
      "VALIDATION",
      `allocateSessionsFefo count 必須為正整數，收到 ${count}`,
    );
  }

  const totalRemaining = candidates.reduce((s, w) => s + w.remainingSessions, 0);
  if (totalRemaining < count) {
    throw new WalletSessionError(
      "NOT_AVAILABLE",
      `跨方案總剩餘 ${totalRemaining} 堂，不足以分配 ${count} 堂`,
    );
  }

  // 排序：preferred 第一，其餘 FEFO
  const sorted = [...candidates].sort(compareWalletByFEFO);
  if (preferredWalletId) {
    const idx = sorted.findIndex((w) => w.id === preferredWalletId);
    if (idx > 0) {
      const [pref] = sorted.splice(idx, 1);
      sorted.unshift(pref);
    }
  }

  let need = count;
  const allocations: Array<{ walletId: string; count: number }> = [];
  let primaryWalletId: string | null = null;

  for (const w of sorted) {
    if (need === 0) break;
    if (w.remainingSessions <= 0) continue;
    const take = Math.min(need, w.remainingSessions);
    const { allocated } = await allocateSessions(tx, w.id, bookingId, take);
    if (allocated === 0) {
      // legacy wallet 無 ledger → 跨 wallet 分配下無法 fallback；略過往下一張
      continue;
    }
    if (allocated < take) {
      // 不該發生（precheck 已過）；保險丟錯 → rollback
      throw new WalletSessionError(
        "NOT_AVAILABLE",
        `wallet ${w.id} 預期配 ${take} 堂只配到 ${allocated}`,
      );
    }
    allocations.push({ walletId: w.id, count: allocated });
    if (primaryWalletId === null) primaryWalletId = w.id;
    need -= allocated;
  }

  if (need > 0) {
    throw new WalletSessionError(
      "NOT_AVAILABLE",
      `跨 wallet FEFO 後仍缺 ${need} 堂（可能為 legacy wallets 無 ledger）`,
    );
  }

  return { allocations, primaryWalletId };
}

// ──────────────────────────────────────────────────────────────
// reReserveSessionsFefo — revert 路徑用，跨 wallet 重新挑 N 堂
// 與 allocateSessionsFefo 同實作，命名區隔語意（從 CANCELLED/NO_SHOW 回 PENDING）
// ──────────────────────────────────────────────────────────────

export async function reReserveSessionsFefo(
  tx: Tx,
  args: {
    candidates: readonly FefoCandidateWallet[];
    bookingId: string;
    count: number;
    preferredWalletId?: string | null;
  }
): Promise<{
  reReserved: number;
  allocations: Array<{ walletId: string; count: number }>;
  primaryWalletId: string | null;
}> {
  const { allocations, primaryWalletId } = await allocateSessionsFefo(tx, args);
  const reReserved = allocations.reduce((s, a) => s + a.count, 0);
  return { reReserved, allocations, primaryWalletId };
}

// ──────────────────────────────────────────────────────────────
// 相容包裝：保留舊單筆 helper 名稱，避免別處意外引用；標 @deprecated。
// 新呼叫端一律用 plural 版本並傳 booking.people。
// ──────────────────────────────────────────────────────────────

/** @deprecated Use allocateSessions(...,count) — 為 people=1 callsite 提供相容包裝 */
export async function allocateSession(
  tx: Tx,
  walletId: string,
  bookingId: string
): Promise<WalletSession | null> {
  const { allocated } = await allocateSessions(tx, walletId, bookingId, 1);
  if (allocated === 0) return null;
  return tx.walletSession.findFirst({ where: { walletId, bookingId, status: "RESERVED" } });
}

/** @deprecated Use releaseSessions(...) — 為 people=1 callsite 提供相容包裝 */
export async function releaseSession(tx: Tx, bookingId: string): Promise<boolean> {
  const { released } = await releaseSessions(tx, bookingId);
  return released > 0;
}

/** @deprecated Use completeSessions(...) — 為 people=1 callsite 提供相容包裝 */
export async function completeSession(
  tx: Tx,
  bookingId: string,
  completedAt: Date = new Date()
): Promise<boolean> {
  const { completed } = await completeSessions(tx, bookingId, completedAt);
  return completed > 0;
}

/** @deprecated Use uncompleteSessions(...) — 為 people=1 callsite 提供相容包裝 */
export async function uncompleteSession(tx: Tx, bookingId: string): Promise<boolean> {
  const { uncompleted } = await uncompleteSessions(tx, bookingId);
  return uncompleted > 0;
}

/** @deprecated Use reReserveSessions(...,count) — 為 people=1 callsite 提供相容包裝 */
export async function reReserveSession(
  tx: Tx,
  walletId: string,
  bookingId: string
): Promise<WalletSession | null> {
  const { reReserved } = await reReserveSessions(tx, walletId, bookingId, 1);
  if (reReserved === 0) return null;
  return tx.walletSession.findFirst({ where: { walletId, bookingId, status: "RESERVED" } });
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

// ──────────────────────────────────────────────────────────────
// backfillAvailableSessions — 補登已使用堂數（紙本卡轉線上）
//
// 從最小 sessionNo 的 AVAILABLE 挑 N 筆 → 改為 BACKFILLED：
//   - completedAt = occurredAt（補登日期）
//   - voidReason = reason 文字
//   - voidedByStaffId = 操作人
//
// Guards：
//   - count 必須為正整數
//   - 不可超過 AVAILABLE 堂數（保護 RESERVED 已預約堂）
//   - CAS 防並行：updateMany WHERE status='AVAILABLE'，count 不符即丟錯
//
// 副作用：
//   - WalletSession 改 BACKFILLED；BACKFILLED 不在 AVAILABLE+RESERVED 計算內
//     → refreshWalletCounter 會把 wallet.remainingSessions 自動扣 N
//   - 不寫 Transaction / AuditLog（呼叫端 server action 負責）
// ──────────────────────────────────────────────────────────────

export async function backfillAvailableSessions(
  tx: Tx,
  params: {
    walletId: string;
    count: number;
    occurredAt: Date;
    reason: string;
    operatorStaffId: string;
  }
): Promise<{ backfilledSessionNos: number[] }> {
  const { walletId, count, occurredAt, reason, operatorStaffId } = params;

  if (!Number.isInteger(count) || count <= 0) {
    throw new WalletSessionError("VALIDATION", "補登堂數必須為正整數");
  }
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new WalletSessionError("VALIDATION", "補登原因不能為空");
  }

  const candidates = await tx.walletSession.findMany({
    where: { walletId, status: "AVAILABLE" },
    orderBy: { sessionNo: "asc" },
    take: count,
    select: { id: true, sessionNo: true },
  });

  if (candidates.length < count) {
    throw new WalletSessionError(
      "VALIDATION",
      `可用堂數不足：本次補登 ${count} 堂，但僅剩 ${candidates.length} 堂可用（已預約保留的堂數不可補登）`
    );
  }

  const ids = candidates.map((c) => c.id);
  const result = await tx.walletSession.updateMany({
    where: { id: { in: ids }, status: "AVAILABLE" },
    data: {
      status: "BACKFILLED",
      completedAt: occurredAt,
      voidReason: trimmedReason,
      voidedByStaffId: operatorStaffId,
    },
  });
  if (result.count !== count) {
    throw new WalletSessionError(
      "NOT_AVAILABLE",
      "並行衝突：部分堂數狀態已變更，請重新整理後再試"
    );
  }

  await refreshWalletCounter(tx, walletId);
  return { backfilledSessionNos: candidates.map((c) => c.sessionNo) };
}

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
