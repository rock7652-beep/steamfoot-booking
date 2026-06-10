/**
 * 顧客「有效堂數」顯示的共用狀態計算。
 *
 * 設計原則：helper 只回傳「狀態」（總堂數 / 是否有有效方案 / 是否進入提醒區間），
 * 不綁死任何文案或樣式 —— 文字（「剩 N 堂」「提醒」「—」「無有效方案」）由各
 * render 端依情境組裝，邏輯共用即可。
 *
 * 「有效堂數」的定義固定在資料層（src/server/queries/customer.ts 的 where）：
 *   status = ACTIVE、remainingSessions > 0、plan.category = PACKAGE、
 *   expiryDate 為 null 或尚未過期。
 * 已排除 TRIAL / SINGLE / 點數型 / 已過期 / 已用完，避免店長誤判是否需提醒儲值。
 * 本檔只負責把「已加總好的有效堂數」映射成顯示狀態。
 */

/** 提醒儲值門檻：剩餘 1–3 堂視為偏低。 */
export const LOW_SESSIONS_THRESHOLD = 3;

export interface RemainingSessionsState {
  /** 有效 PACKAGE 剩餘堂數加總（已正規化為 >= 0 的整數）。 */
  total: number;
  /** 是否有任何有效 PACKAGE 堂數（total > 0）。false → 顯示空狀態（—／無有效方案）。 */
  hasValid: boolean;
  /** 是否進入提醒區間（1–3 堂）。用來顯示「提醒 / 提醒儲值」。 */
  isLow: boolean;
}

/**
 * 把「有效 PACKAGE 剩餘堂數加總」映射成顯示狀態。
 * 防呆：非有限數 / 負數一律視為 0。
 */
export function remainingSessionsState(total: number): RemainingSessionsState {
  const n = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  return {
    total: n,
    hasValid: n > 0,
    isLow: n >= 1 && n <= LOW_SESSIONS_THRESHOLD,
  };
}
