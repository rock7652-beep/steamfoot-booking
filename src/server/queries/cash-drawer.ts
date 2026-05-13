/**
 * Cash Drawer queries — page-facing read-only helpers
 *
 * 設計：把 state 推導抽成 pure function `deriveCashDrawerView`，方便單元測試。
 * Page 只負責 query DB → 餵 pure function → 渲染。
 *
 * 4 種 state：
 *   - EMPTY：店家尚未啟用（沒有任何 session）
 *   - OPENED_TODAY：今日已有 session（不管 OPEN 或未來的 CLOSED）
 *   - WARNING_LAST_OPEN：今日無 session，且最近的 session 仍 OPEN（上日尚未閉店）
 *   - NOT_OPENED_TODAY：今日無 session，且最近 session 是 CLOSED → 可開店
 */

import { prisma } from "@/lib/db";
import type { CashDrawerSession } from "@prisma/client";

export type CashDrawerView =
  | { state: "EMPTY" }
  | { state: "OPENED_TODAY"; session: CashDrawerSession }
  | { state: "WARNING_LAST_OPEN"; lastSession: CashDrawerSession }
  | { state: "NOT_OPENED_TODAY"; lastSession: CashDrawerSession };

/** 純函式：根據 today session + latest session 推 view state。可單元測試。 */
export function deriveCashDrawerView(
  todaySession: CashDrawerSession | null,
  latestSessionOnOrBeforeToday: CashDrawerSession | null,
): CashDrawerView {
  if (todaySession) {
    return { state: "OPENED_TODAY", session: todaySession };
  }
  if (!latestSessionOnOrBeforeToday) {
    return { state: "EMPTY" };
  }
  if (latestSessionOnOrBeforeToday.status === "OPEN") {
    return { state: "WARNING_LAST_OPEN", lastSession: latestSessionOnOrBeforeToday };
  }
  // CLOSED（或未來的 NEED_REVIEW，視同已結帳）
  return { state: "NOT_OPENED_TODAY", lastSession: latestSessionOnOrBeforeToday };
}

/** DB query + state 推導，給 page 用。 */
export async function getCashDrawerView(
  storeId: string,
  todayBusinessDate: Date,
): Promise<CashDrawerView> {
  const [todaySession, latestSession] = await Promise.all([
    prisma.cashDrawerSession.findUnique({
      where: { storeId_businessDate: { storeId, businessDate: todayBusinessDate } },
    }),
    prisma.cashDrawerSession.findFirst({
      where: { storeId, businessDate: { lte: todayBusinessDate } },
      orderBy: { businessDate: "desc" },
    }),
  ]);
  return deriveCashDrawerView(todaySession, latestSession);
}
