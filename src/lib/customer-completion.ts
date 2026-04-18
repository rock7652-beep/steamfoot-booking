/**
 * 顧客完成註冊狀態 — 純邏輯 helper
 *
 * 「註冊完成」= 以下欄位皆有值：
 *   - name
 *   - phone（必須是 09 開頭 10 碼手機；排除 OAuth 佔位符 _oauth_...）
 *   - email
 *   - birthday
 *   - gender
 *
 * notes 不列入必填。
 *
 * DB schema 不變；本檢查只在 app 層使用，舊資料 nullable 不會 crash。
 */

export const REQUIRED_CUSTOMER_FIELDS = [
  "name",
  "phone",
  "email",
  "birthday",
  "gender",
] as const;

export type RequiredCustomerField = (typeof REQUIRED_CUSTOMER_FIELDS)[number];

export interface CustomerCompletionShape {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  birthday?: Date | null | string;
  gender?: string | null;
}

/** phone 是否為 OAuth signIn 建立時的佔位符（_oauth_line_xxx / _oauth_google_xxx） */
export function isPlaceholderPhone(phone: string | null | undefined): boolean {
  if (!phone) return true;
  return phone.startsWith("_oauth_") || !/^09\d{8}$/.test(phone);
}

/** 回傳缺少的必填欄位清單 */
export function missingRequiredFields(
  c: CustomerCompletionShape | null | undefined,
): RequiredCustomerField[] {
  if (!c) return [...REQUIRED_CUSTOMER_FIELDS];
  const missing: RequiredCustomerField[] = [];
  if (!c.name || !c.name.trim()) missing.push("name");
  if (isPlaceholderPhone(c.phone)) missing.push("phone");
  if (!c.email || !c.email.trim()) missing.push("email");
  if (!c.birthday) missing.push("birthday");
  if (!c.gender || !c.gender.trim()) missing.push("gender");
  return missing;
}

export function isCustomerProfileComplete(
  c: CustomerCompletionShape | null | undefined,
): boolean {
  return missingRequiredFields(c).length === 0;
}
