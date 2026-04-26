/**
 * Customer Plan Contract — 顧客方案／堂數的「唯一真相來源」
 * ============================================================
 *
 * 為什麼存在：
 *   過去前台四個地方各自計算「剩餘堂數」「已預約」「可預約」，公式都不同：
 *
 *     - book/page.tsx：     totalSessions - sum(COMPLETED+NO_SHOW.people) - sum(PENDING+CONFIRMED.people)
 *     - my-plans/page.tsx：wallet.remainingSessions - count(PENDING_STATUSES, !isMakeup)
 *     - book/new/page.tsx：同 my-plans
 *     - my-bookings/page.tsx：sum(wallet.remainingSessions)（不扣 pending）
 *
 *   結果：顧客在不同頁面看到不同數字（25 / 26 / 1 / 兩個都不對）。本契約建立**唯一公式**，
 *   所有顧客 UI 必須引用同一套定義，不能再各自實作。
 *
 * ============================================================
 * 唯一定義（強制）：
 *
 *   totalRemainingSessions  = Σ(wallet.remainingSessions) for ACTIVE wallets
 *   reservedPendingSessions = Σ count of bookings tied to ACTIVE wallet
 *                             where bookingStatus ∈ BOOKING_UPCOMING && !isMakeup
 *   availableSessions       = max(0, totalRemainingSessions - reservedPendingSessions)
 *
 *   hasActivePlan = exists ACTIVE wallet
 *   hasBookable   = availableSessions > 0
 *
 *   每個 wallet 的對等量：
 *     remainingSessions  = wallet.remainingSessions（DB counter，由 wallet-session 維持）
 *     reservedPending    = count of upcoming bookings on this wallet (non-makeup)
 *     availableToBook    = max(0, remainingSessions - reservedPending)
 *
 * ============================================================
 * 規則（強制）：
 *   - 任何顧客 UI／server query 需要「剩餘 / 已預約 / 可預約」數字，**必須**走本檔，
 *     禁止 inline 計算（含 reduce / filter / count）。
 *   - status filter **必須**用 `BOOKING_UPCOMING` 等 booking-constants 常數，
 *     禁止寫死 `["PENDING", "CONFIRMED"]`。
 *   - customerId 必須是 canonical（透過 customer-identity contract 取得），
 *     禁止信任 session.user.customerId 直接做 DB 查詢。
 */

import { prisma } from "@/lib/db";
import { BOOKING_UPCOMING } from "@/lib/booking-constants";
import {
  getCanonicalCustomerForSession,
  type SessionLikeForIdentity,
} from "@/lib/customer-identity";
import type { WalletStatus } from "@prisma/client";

// ============================================================
// 型別
// ============================================================

export interface CustomerPlanWalletBookingRow {
  bookingDate: Date;
  slotTime: string;
  bookingStatus: string;
  isMakeup: boolean;
  people: number;
  noShowPolicy: string | null;
}

/** 單一 wallet 的契約摘要 */
export interface CustomerPlanWalletSummary {
  id: string;
  plan: { name: string; category: string; sessionCount: number };
  status: WalletStatus;
  totalSessions: number;
  /** DB counter，由 wallet-session 維持 */
  remainingSessions: number;
  /** 該 wallet 上 BOOKING_UPCOMING 且非補課的 booking 數量 */
  reservedPending: number;
  /** = max(0, remainingSessions - reservedPending) */
  availableToBook: number;
  startDate: Date;
  expiryDate: Date | null;
  /** 完整 booking 列表（顯示「使用紀錄」需要） — 不過濾，由呼叫端視情況篩 */
  bookings: CustomerPlanWalletBookingRow[];
}

/** 顧客整體方案摘要 */
export interface CustomerPlanSummary {
  customerId: string;
  storeId: string;
  /** Σ(wallet.remainingSessions) for ACTIVE wallets */
  totalRemainingSessions: number;
  /** Σ(reservedPending) for ACTIVE wallets */
  reservedPendingSessions: number;
  /** = max(0, totalRemainingSessions - reservedPendingSessions) */
  availableSessions: number;
  /** 至少有一個 ACTIVE wallet（不論 availableSessions 是否 > 0） */
  hasActivePlan: boolean;
  /** ACTIVE wallets，依 createdAt desc */
  activeWallets: CustomerPlanWalletSummary[];
  /** EXPIRED wallets */
  expiredWallets: CustomerPlanWalletSummary[];
  /** USED_UP / CANCELLED wallets */
  historyWallets: CustomerPlanWalletSummary[];
}

// ============================================================
// 純函式：把 DB row 轉契約摘要（無 IO，可單測）
// ============================================================

/** 計算單一 wallet 的契約摘要欄位 */
export function computeWalletSummary(input: {
  id: string;
  plan: { name: string; category: string; sessionCount: number };
  status: WalletStatus;
  totalSessions: number;
  remainingSessions: number;
  startDate: Date;
  expiryDate: Date | null;
  bookings: CustomerPlanWalletBookingRow[];
}): CustomerPlanWalletSummary {
  const reservedPending = countReservedPending(input.bookings);
  const availableToBook = Math.max(0, input.remainingSessions - reservedPending);
  return {
    id: input.id,
    plan: input.plan,
    status: input.status,
    totalSessions: input.totalSessions,
    remainingSessions: input.remainingSessions,
    reservedPending,
    availableToBook,
    startDate: input.startDate,
    expiryDate: input.expiryDate,
    bookings: input.bookings,
  };
}

/** 計算 booking 集合中「待到店且非補課」的筆數 — 唯一定義來源 */
export function countReservedPending(bookings: CustomerPlanWalletBookingRow[]): number {
  const upcoming: readonly string[] = BOOKING_UPCOMING;
  return bookings.filter((b) => !b.isMakeup && upcoming.includes(b.bookingStatus)).length;
}

/** 把多個 wallet 的契約摘要聚合成 customer-level 摘要 */
export function aggregateCustomerSummary(args: {
  customerId: string;
  storeId: string;
  wallets: CustomerPlanWalletSummary[];
}): CustomerPlanSummary {
  const activeWallets = args.wallets.filter((w) => w.status === "ACTIVE");
  const expiredWallets = args.wallets.filter((w) => w.status === "EXPIRED");
  const historyWallets = args.wallets.filter(
    (w) => w.status === "USED_UP" || w.status === "CANCELLED",
  );

  const totalRemainingSessions = activeWallets.reduce((s, w) => s + w.remainingSessions, 0);
  const reservedPendingSessions = activeWallets.reduce((s, w) => s + w.reservedPending, 0);
  const availableSessions = Math.max(0, totalRemainingSessions - reservedPendingSessions);

  return {
    customerId: args.customerId,
    storeId: args.storeId,
    totalRemainingSessions,
    reservedPendingSessions,
    availableSessions,
    hasActivePlan: activeWallets.length > 0,
    activeWallets,
    expiredWallets,
    historyWallets,
  };
}

// ============================================================
// 含 IO：撈資料 + 計算契約摘要
// ============================================================

/**
 * 取得指定 customerId 的方案摘要（內部 / 後台用）。
 *
 * 不含 wallet sessions（單堂明細） — 顯示用途的呼叫端若需要 sessions，請自行多撈一筆
 * 並 merge，避免本契約 query 被擴成「萬用 customer 大查詢」。
 */
export async function getCustomerPlanSummary(
  customerId: string,
): Promise<CustomerPlanSummary | null> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      storeId: true,
      planWallets: {
        select: {
          id: true,
          status: true,
          totalSessions: true,
          remainingSessions: true,
          startDate: true,
          expiryDate: true,
          plan: { select: { name: true, category: true, sessionCount: true } },
          bookings: {
            select: {
              bookingDate: true,
              slotTime: true,
              bookingStatus: true,
              isMakeup: true,
              people: true,
              noShowPolicy: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!customer) return null;

  const wallets = customer.planWallets.map((w) =>
    computeWalletSummary({
      id: w.id,
      plan: w.plan,
      status: w.status,
      totalSessions: w.totalSessions,
      remainingSessions: w.remainingSessions,
      startDate: w.startDate,
      expiryDate: w.expiryDate,
      bookings: w.bookings,
    }),
  );

  return aggregateCustomerSummary({
    customerId: customer.id,
    storeId: customer.storeId,
    wallets,
  });
}

/**
 * 顧客自助流程：以 session 解析 canonical customer 後計算方案摘要。
 *
 * - 找不到 canonical customer → 回 null（呼叫端通常顯示 NoPlanEmptyState）
 * - 不可信任 client 傳入 customerId
 */
export async function getCustomerPlanSummaryForSession(
  user: SessionLikeForIdentity,
): Promise<CustomerPlanSummary | null> {
  const canonical = await getCanonicalCustomerForSession(user);
  if (!canonical) return null;
  return getCustomerPlanSummary(canonical.id);
}
