import "server-only";
import { prisma } from "@/lib/db";
import { toLocalDateStr } from "@/lib/date-utils";
import { PENDING_STATUSES } from "@/lib/booking-constants";
import {
  walletAvailableToBook,
  walletPendingCount,
  ledgerUsage,
} from "@/lib/wallet-availability";
import { splitLiffWallets } from "@/lib/liff/my-wallets";

/** LIFF「我的方案」單筆 row 顯示用 payload — server compute 後送 client，
 *  client 不再做 availability / ledger 計算（避免分散兩處）。 */
export interface LiffWalletRow {
  id: string;
  planName: string;
  /** TRIAL / PACKAGE / SINGLE — UI 分組 / icon 用 */
  planCategory: string;
  /** Booking 期間總堂數（含已使用 + 未使用） */
  totalSessions: number;
  /** Raw remainingSessions = AVAILABLE + RESERVED（含待到店預約占用）
   *  ⚠️ 這個數字不是「還能再預約幾次」— 顧客面別單獨顯示，需配 availableToBook 拆分。 */
  remainingSessions: number;
  /** 真正「還能再預約幾次」 = WalletSession AVAILABLE。canonical。 */
  availableToBook: number;
  /** 待到店（已預約未到店的非補課堂數） */
  pendingCount: number;
  /** 已使用（含 BACKFILLED 補登；不含 VOIDED） */
  usedCount: number;
  /** 已註銷（VOIDED；獨立呈現） */
  voidedCount: number;
  /** "YYYY-MM-DD" — Date → string 在 server 邊界序列化 */
  startDate: string;
  /** "YYYY-MM-DD" 或 null（無期限方案） */
  expiryDate: string | null;
  /** WalletStatus 原值；client splitLiffWallets 用 + UI badge 用 */
  status: string;
  usageRecords?: Array<{ id: string; date: string | null; time: string | null; label: string; sessions: number; status: string }>;
}

/** PR-NoShow-2：有效補課券（未使用、未過期）投影 — 供顧客端顯示與「優先用券」提示。 */
export interface LiffMakeupCreditRow {
  id: string;
  /** "YYYY-MM-DD" 或 null（無期限） */
  expiredAt: string | null;
}

export type FetchLiffWalletsResult =
  | {
      status: "ok";
      active: LiffWalletRow[];
      expired: LiffWalletRow[];
      history: LiffWalletRow[];
      /** 有效補課券，依最早到期排序（最早到期優先使用）。 */
      makeupCredits: LiffMakeupCreditRow[];
    }
  | { status: "no_customer" }
  | { status: "service_unavailable" };

export async function readFetchLiffWallets({ storeId, customerId }: { storeId: string; customerId: string }): Promise<FetchLiffWalletsResult> {
  // ── 3. Query — tight LIFF payload ──────────────────
  //
  // 排序 expiryDate ASC nulls last（最近過期優先；無期限排最後）+ createdAt DESC
  // tie-break。Prisma 6.19.2 支援 nulls:"last" — 不需 post-query helper sort。
  //
  // bookings select 只取 walletPendingCount 需要的兩欄；session select 只取
  // ledgerUsage 需要的 status — 控制 wire payload。
  let rawWallets: Array<{
    id: string;
    totalSessions: number;
    remainingSessions: number;
    startDate: Date;
    expiryDate: Date | null;
    status: string;
    plan: { name: string; category: string };
    bookings: Array<{ bookingStatus: string; isMakeup: boolean; people: number }>;
    sessions: Array<{ id?: string; status: string; completedAt?: Date | null; booking?: { id: string; customerId: string; storeId: string; bookingDate: Date; slotTime: string; bookingStatus: string } | null }>;
  }>;
  try {
    rawWallets = await prisma.customerPlanWallet.findMany({
      where: { customerId, storeId },
      select: {
        id: true,
        totalSessions: true,
        remainingSessions: true,
        startDate: true,
        expiryDate: true,
        status: true,
        plan: { select: { name: true, category: true } },
        // booking.people 僅供 legacy 無 WalletSession ledger 的相容 fallback。
        bookings: {
          where: { bookingStatus: { in: [...PENDING_STATUSES] } },
          select: { bookingStatus: true, isMakeup: true, people: true },
        },
        // ledgerUsage 只需要 session.status (COMPLETED/BACKFILLED/VOIDED 分類)
        sessions: {
          select: { id: true, status: true, completedAt: true, booking: { select: { id: true, customerId: true, storeId: true, bookingDate: true, slotTime: true, bookingStatus: true } } },
        },
      },
      orderBy: [
        { expiryDate: { sort: "asc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      take: 100,
    });
  } catch (err) {
    console.error("[fetchLiffWallets] query failed", err);
    return { status: "service_unavailable" };
  }

  // ── 4. Compute display payload via canonical helpers ─
  // **嚴格 reuse wallet-availability.ts 既有 helper** — 不自行手算 totalSessions − Σbooking
  // （codebase 既有規則，避免忽略 BACKFILLED / VOIDED 導致首頁高報、卡片低報）。
  const toRow = (w: (typeof rawWallets)[number]): LiffWalletRow => {
    const pendingCount = walletPendingCount(w);
    const availableToBook = walletAvailableToBook(w);
    const { used: usedCount, voided: voidedCount } = ledgerUsage(w.sessions);
    const usage = new Map<string, NonNullable<LiffWalletRow["usageRecords"]>[number]>();
    for (const session of w.sessions ?? []) {
      if (!["COMPLETED", "BACKFILLED"].includes(session.status)) continue;
      const booking = session.booking;
      if (booking && (booking.storeId !== storeId || booking.customerId !== customerId)) continue;
      const id = booking?.id ?? session.id;
      if (!id) continue;
      const existing = usage.get(id);
      if (existing) { existing.sessions += 1; continue; }
      usage.set(id, { id, date: booking ? booking.bookingDate.toISOString().slice(0, 10) : session.completedAt ? toLocalDateStr(session.completedAt) : null,
        time: booking?.slotTime ?? null, label: booking ? "蒸足" : "補登使用", sessions: 1,
        status: booking?.bookingStatus === "NO_SHOW" ? "未到扣堂" : booking ? "已完成" : "補登" });
    }
    return {
      usageRecords: [...usage.values()].sort((a, b) => `${b.date ?? ""} ${b.time ?? ""}`.localeCompare(`${a.date ?? ""} ${a.time ?? ""}`)),
      id: w.id,
      planName: w.plan.name,
      planCategory: w.plan.category,
      totalSessions: w.totalSessions,
      remainingSessions: w.remainingSessions,
      availableToBook,
      pendingCount,
      usedCount,
      voidedCount,
      startDate: w.startDate.toISOString().slice(0, 10),
      expiryDate: w.expiryDate ? w.expiryDate.toISOString().slice(0, 10) : null,
      status: w.status,
    };
  };

  const rows = rawWallets.map(toRow);

  // ── 5. Split active / expired / history (defensive，per 拍板 B (b)) ──
  // ACTIVE + availableToBook=0 → history（視同 USED_UP）
  // ACTIVE + expiryDate < today → expired（防 race，不依賴 status auto-flip）
  const { active, expired, history } = splitLiffWallets(rows);

  // ── 6. 有效補課券（PR-NoShow-2）：未使用、未過期，最早到期優先 ──
  let makeupCredits: LiffMakeupCreditRow[] = [];
  try {
    const credits = await prisma.makeupCredit.findMany({
      where: {
        customerId,
        storeId,
        isUsed: false,
        OR: [{ expiredAt: null }, { expiredAt: { gte: new Date() } }],
      },
      select: { id: true, expiredAt: true },
      orderBy: [{ expiredAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: 50,
    });
    makeupCredits = credits.map((c) => ({
      id: c.id,
      // expiredAt 是 timestamp（非 date-only 欄位）→ 以台灣時區轉日期，避免 UTC 切片 off-by-one。
      expiredAt: c.expiredAt ? toLocalDateStr(c.expiredAt) : null,
    }));
  } catch (err) {
    // 補課券查詢失敗不影響方案顯示主流程；降級為「無券」。
    console.warn("[fetchLiffWallets] makeupCredit query failed", err);
    makeupCredits = [];
  }

  return { status: "ok", active, expired, history, makeupCredits };
}
