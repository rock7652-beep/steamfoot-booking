/**
 * 共用 input 正規化工具。
 * 用於 server action 內、validator 前，把使用者「可能怎麼打」吸收成統一格式。
 */

/**
 * 台灣手機號碼正規化
 *
 * 支援輸入：
 *   0912345678
 *   0912-345-678
 *   0912 345 678
 *   +886912345678 / 886912345678（補 0）
 *
 * 回傳：一律 10 碼 `09xxxxxxxx`（若格式不符則回傳原始 trim 後字串，
 * 讓後續 validator 去報明確錯誤，而不是在這裡硬吞）。
 */
export function normalizePhone(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  const digitsOnly = trimmed.replace(/[\s\-()]/g, "");
  if (/^\+?886\d{9}$/.test(digitsOnly)) {
    return "0" + digitsOnly.replace(/^\+?886/, "");
  }
  return digitsOnly;
}

/**
 * Email 正規化：trim + 轉小寫。
 */
export function normalizeEmail(raw: string): string {
  return (raw ?? "").trim().toLowerCase();
}
