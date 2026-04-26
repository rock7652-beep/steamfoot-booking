/**
 * Customer Identity Contract
 * ============================================================
 *
 * 顧客身份在本系統的「唯一真相來源」（Single Source of Truth）。
 *
 * 為什麼存在：
 *   `session.user.customerId` 在以下情境會 stale，直接拿來查 DB 會「資料寫入正常但
 *   讀取返回空」：
 *     1. 顧客資料 merge / placeholder 重綁
 *     2. LINE 跨環境 JWT 殘留
 *     3. 清庫 / 還原備份後 cookie 仍持舊 ID
 *     4. 顧客 user 與 customer row 在多環境之間不一致
 *
 *   過去多次 P0（#44–#50）都源於：寫入用 canonical A，讀取用 stale B → 不同步。
 *   本檔案提供統一入口，後續所有 customer-facing 路徑都應只走這裡。
 *
 * 規則（強制）：
 *   - 任何 server query / action / page 需要顧客的 customerId，**必須** 走
 *     `getCanonicalCustomerForSession(user)`，禁止：
 *       - 直接讀 `user.customerId` / `session.user.customerId`
 *       - 信任 client 傳入的 `customerId`（顧客自助流程）
 *   - 員工/管理員代客操作 `input.customerId` 才是合法的 target。
 *
 * 例外（display-only）：
 *   - layout / mobile-nav 等純展示用途（傳給 client component 做 share URL、
 *     analytics 等）允許讀 `user.customerId` 作為「最佳猜測」，但**不可**用它做
 *     DB 查詢。任何 query 一律走本檔案。
 */

import { resolveCustomerForUser } from "@/server/queries/customer-completion";

/** Session 端能拿到的最小欄位 — 涵蓋 NextAuth 與 LIFF 兩條登入路徑 */
export interface SessionLikeForIdentity {
  id: string;
  customerId?: string | null;
  email?: string | null;
  storeId?: string | null;
}

/** Resolver 結果 — 與 resolveCustomerForUser 對齊但裁剪到 booking-relevant 欄位 */
export interface CanonicalCustomer {
  id: string;
  storeId: string;
  /** 是否走 fallback path 救回（A path stale 後從 userId/email 找回）— 後台診斷用 */
  recoveredFromStaleSession: boolean;
}

/**
 * 取得 session 對應的 canonical Customer。
 *
 * - 找到（含經 userId/email/phone fallback 救回）→ 回傳 `{ id, storeId, recoveredFromStaleSession }`
 * - 找不到 → 回傳 `null`
 *
 * 呼叫端決策：
 *   - **read** 場景找不到 → 回傳空清單（避免拋例外給 UI）
 *   - **write** 場景找不到 → throw `AppError("UNAUTHORIZED", "找不到您的顧客資料，請重新登入")`
 *   - **ownership check** 找不到 → throw `AppError("FORBIDDEN", ...)`
 */
export async function getCanonicalCustomerForSession(
  user: SessionLikeForIdentity,
): Promise<CanonicalCustomer | null> {
  const resolved = await resolveCustomerForUser({
    userId: user.id,
    sessionCustomerId: user.customerId ?? null,
    sessionEmail: user.email ?? null,
    storeId: user.storeId ?? null,
  });
  if (!resolved.customer) return null;
  return {
    id: resolved.customer.id,
    storeId: resolved.customer.storeId,
    recoveredFromStaleSession:
      resolved.staleSessionCleared === true ||
      resolved.reason === "found_by_userid" ||
      resolved.reason === "bound_by_email" ||
      resolved.reason === "bound_by_phone",
  };
}

/**
 * Convenience：只要 customerId（最常見用途）。
 * 找不到回 null，呼叫端自行處理。
 */
export async function getCanonicalCustomerIdForSession(
  user: SessionLikeForIdentity,
): Promise<string | null> {
  const c = await getCanonicalCustomerForSession(user);
  return c?.id ?? null;
}
