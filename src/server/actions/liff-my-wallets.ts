"use server";

/**
 * fetchLiffWallets — LIFF 顧客「我的方案 / 剩餘堂數」server action (PR-E2)
 *
 * 與既有 `/my-plans` 客戶 web 頁共存不取代：
 *   - `/my-plans` (src/app/(customer)/my-plans/page.tsx) 服務桌面 / customer web；payload 偏胖
 *     （含 session usage grid / detail accordion / makeup credit）
 *   - 本 action 是 LIFF-only read-only 投影：tight payload，server compute 完整顯示欄位後
 *     送 client，client 只 render
 *
 * 設計合約（per PR-E2 audit + 拍板）：
 *   1. 嚴格 CUSTOMER role only（staff 不該透過 LIFF 看 wallet 清單）
 *   2. **零 client 參數** — 全走 `requireSession` + `getCanonicalCustomerIdForSession`
 *   3. storeId 從 `user.storeId`（LIFF onboarding 寫入），不從 URL slug 信
 *   4. **不 throw 給 caller** — 全部 status discriminated union
 *   5. read-only Prisma query；不寫 DB / AuditLog（無資料異動）
 *   6. **canonical helper reuse**：堂數計算統一走 `wallet-availability.ts`，
 *      禁止本檔自行手算 totalSessions − Σbooking（會忽略 BACKFILLED / VOIDED）
 *
 * 不在此 PR 範圍：
 *   - 不接 cancel / 不接續約 / 不接購買 / 不接付款
 *   - 不動 wallet status（ACTIVE → EXPIRED / USED_UP 由 refreshWalletCounter 負責）
 *   - 不動 WalletSession / Booking / Transaction / Reminder
 *   - 不動 schema / migration / Customer model
 */

import { readFetchLiffWallets } from "@/server/queries/liff-my-wallets";
import { requireSession } from "@/lib/session";
import { getCanonicalCustomerIdForSession } from "@/lib/customer-identity";

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
  /** Actual ledger debits; absent in older/other-module projections. */
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

export async function fetchLiffWallets(): Promise<FetchLiffWalletsResult> {
  // ── 1. Require CUSTOMER session ────────────────────
  let user;
  try {
    user = await requireSession();
  } catch {
    return { status: "no_customer" };
  }
  if (user.role !== "CUSTOMER") return { status: "no_customer" };

  // ── 2. Resolve canonical customer + store ──────────
  // 不信 session.customerId（可能 stale；同 PR-D1A / D2 / D4A 設計）。
  const customerId = await getCanonicalCustomerIdForSession(user);
  if (!customerId) return { status: "no_customer" };
  const storeId = user.storeId;
  if (!storeId) return { status: "no_customer" };

  return readFetchLiffWallets({ storeId, customerId });
}
