/**
 * 顧客前台堂數顯示的唯一計算來源。
 *
 * canonical 定義（與 src/server/services/wallet-session.ts 的 refreshWalletCounter 一致）：
 *   remainingSessions ≡ count(WalletSession AVAILABLE) + count(RESERVED)
 *   可預約堂數         = count(WalletSession AVAILABLE)
 *   待到店堂數         = count(WalletSession RESERVED)
 *   已使用             = WalletSession COMPLETED + BACKFILLED（含補登紙本已使用）
 *   已註銷             = WalletSession VOIDED（獨立呈現，不可混入已使用）
 *
 * 禁止各頁自行用 `totalSessions − Σbooking` 手算可預約 / 已使用——
 * 那會忽略 BACKFILLED / VOIDED，導致首頁高報、卡片低報。
 */

import { PENDING_STATUSES } from "@/lib/booking-constants";

export interface AvailabilityBooking {
  bookingStatus: string;
  isMakeup: boolean;
  /** Legacy fallback only. Modern wallets use WalletSession ledger rows. */
  people?: number;
}

export interface AvailabilityWallet {
  remainingSessions: number;
  bookings?: AvailabilityBooking[];
  /** Canonical per-session ledger. Empty/missing means legacy wallet fallback. */
  sessions?: WalletSessionRow[];
}

/** 單一 wallet 待到店（占用 remaining 但尚未消耗）的堂數。 */
export function walletPendingCount(w: AvailabilityWallet): number {
  const sessions = w.sessions ?? [];
  if (sessions.length > 0) {
    return sessions.filter((s) => s.status === "RESERVED").length;
  }

  // Legacy wallets without WalletSession rows: retain compatibility, but count
  // reserved people rather than booking rows. Modern mixed makeup/package and
  // cross-wallet bookings are always resolved by the ledger branch above.
  return (w.bookings ?? []).reduce((sum, b) => {
    if (b.isMakeup || !(PENDING_STATUSES as readonly string[]).includes(b.bookingStatus)) {
      return sum;
    }
    return sum + Math.max(1, Math.trunc(b.people ?? 1));
  }, 0);
}

/** 單一 wallet 目前還可預約的堂數（不可為負）。 */
export function walletAvailableToBook(w: AvailabilityWallet): number {
  const sessions = w.sessions ?? [];
  if (sessions.length > 0) {
    return sessions.filter((s) => s.status === "AVAILABLE").length;
  }
  return Math.max(0, w.remainingSessions - walletPendingCount(w));
}

/** 多個 active wallet 的可預約總和（首頁、my-plans 上方共用，逐 wallet clamp 再加總）。 */
export function totalAvailableToBook(wallets: AvailabilityWallet[]): number {
  return wallets.reduce((sum, w) => sum + walletAvailableToBook(w), 0);
}

export interface WalletSessionRow {
  status: string;
}

export interface LedgerUsage {
  /** 已使用（含 BACKFILLED 補登），不含 VOIDED */
  used: number;
  /** 店長註銷，獨立呈現，不可混入已使用 */
  voided: number;
}

const USED_SESSION_STATUSES = ["COMPLETED", "BACKFILLED"] as const;

/** 由 WalletSession ledger 推導「已使用 / 已註銷」（canonical，取代 booking-derived 計數）。 */
export function ledgerUsage(sessions: WalletSessionRow[]): LedgerUsage {
  let used = 0;
  let voided = 0;
  for (const s of sessions) {
    if ((USED_SESSION_STATUSES as readonly string[]).includes(s.status)) used += 1;
    else if (s.status === "VOIDED") voided += 1;
  }
  return { used, voided };
}
