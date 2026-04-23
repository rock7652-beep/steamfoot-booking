/**
 * Referral code — 顧客專屬推薦碼
 *
 * 設計原則（2026-04 定案）：
 *   - 6 碼大寫英數
 *   - 排除易混淆字元：0 / O / 1 / I / L
 *   - 字元集：ABCDEFGHJKMNPQRSTUVWXYZ23456789（共 32 字，5 bit × 6 = 30 bit 空間）
 *   - 對應 Customer.referralCode（@unique）
 *
 * 用途：
 *   - 前台分享連結：`/s/<slug>/line-entry?ref=ABC234`
 *   - 口頭 / 截圖分享：字元集避免閱讀歧義
 *
 * nullable 相容：
 *   - 舊會員 referralCode 可能為 null
 *   - 由 backfill script 批量補碼，或分享頁 lazy-generate 即時補
 *   - 分享頁在 render 階段不寫 DB（避免副作用），lazy-generate 走 server action
 */

const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const REFERRAL_CODE_LENGTH = 6;

/**
 * 隨機生成一組 6 碼推薦碼（不保證唯一，需 caller 做 DB 查重）。
 * 使用 crypto.getRandomValues 以確保分佈隨機性。
 */
export function generateReferralCode(): string {
  const bytes = new Uint8Array(REFERRAL_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i += 1) {
    const index = bytes[i]! % REFERRAL_CODE_ALPHABET.length;
    out += REFERRAL_CODE_ALPHABET[index];
  }
  return out;
}

/**
 * 判斷字串格式是否為合法推薦碼（僅做格式檢查，不查 DB）。
 */
export function isReferralCodeFormat(value: string): boolean {
  if (value.length !== REFERRAL_CODE_LENGTH) return false;
  for (let i = 0; i < value.length; i += 1) {
    if (!REFERRAL_CODE_ALPHABET.includes(value[i]!)) return false;
  }
  return true;
}
