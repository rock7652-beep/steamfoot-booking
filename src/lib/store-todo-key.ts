/**
 * Store-todo key helpers — PR-149
 *
 * 抽出純函式（無 DB / 無 "use server"），方便單元測試。
 *
 * todoKey 格式：
 *   payment:${txId}                              （PAYMENT，dedupe 前已排除）
 *   booking:${bookingId}                         （BOOKING，各自成 bucket）
 *   followup:${customerId}:${lastBookingDate}    （FOLLOW_UP，date 為狀態 token）
 *   lowsessions:${customerId}:${walletToken}     （LOW_SESSIONS，wallet 組成為狀態 token）
 *   vipinterest:${customerId}:${notificationId}  （VIP_INTEREST，單筆續購意願）
 *
 * FOLLOW_UP / LOW_SESSIONS 內嵌狀態 token：顧客回訪 / 補堂換錢包 →
 * token 變 → key 變 → 舊 TodoDismiss 不再 match → 重新提醒。
 */

/**
 * 從 todoKey 取「該筆所屬顧客 id」用於跨型別去重（同顧客保留最高優先級那筆）。
 *
 * 一律取「第二段」(seg[1])：
 *   - payment:txId            → txId   （PAYMENT 已在 dedupe 前 filter 掉，回傳值不影響結果）
 *   - booking:bookingId       → bookingId（維持原行為：bookingId 唯一，各 booking 自成 bucket）
 *   - followup:cust:date      → cust   （正確以 customerId 去重）
 *   - lowsessions:cust:token  → cust   （正確以 customerId 去重）
 *
 * 舊版用 `todoId.slice(indexOf(":")+1)`（冒號後全部）會被 3 段 key 打破
 * （followup:cust:date 會回 "cust:date"，同顧客不同日期無法去重）→ 改取 seg[1]。
 */
export function customerIdFromTodoId(todoId: string): string | null {
  const parts = todoId.split(":");
  if (parts.length < 2) return null;
  const seg = parts[1];
  return seg.length > 0 ? seg : null;
}
