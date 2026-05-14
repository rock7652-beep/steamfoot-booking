/**
 * Cash Drawer queries — page-facing read-only helpers
 *
 * 設計：把 state 推導抽成 pure function `deriveCashDrawerView`，方便單元測試。
 * Page 只負責 query DB → 餵 pure function → 渲染。
 *
 * 4 種 state：
 *   - EMPTY：店家尚未啟用（沒有任何 session）
 *   - OPENED_TODAY：今日已有 session（不管 OPEN 或 CLOSED）
 *       含 liveTotals：OPEN 狀態時包含 live 計算的 expectedClosingCash 等，給閉店表單預覽用
 *   - WARNING_LAST_OPEN：今日無 session，且最近的 session 仍 OPEN（上日尚未閉店）
 *   - NOT_OPENED_TODAY：今日無 session，且最近 session 是 CLOSED → 可開店
 */

import { prisma } from "@/lib/db";
import type { CashDrawerSession, CashDrawerEntry, Prisma } from "@prisma/client";
import {
  computeCashIncomeForSession,
  computeCashExpenseForSession,
  computeManualEntryTotals,
  computeExpectedClosingCash,
} from "@/server/services/cash-drawer";

export type CashDrawerLiveTotals = {
  cashIncomeTotal: Prisma.Decimal;
  cashExpenseTotal: Prisma.Decimal;
  cashWithdrawalTotal: Prisma.Decimal;
  cashDepositTotal: Prisma.Decimal;
  cashAdjustmentTotal: Prisma.Decimal;
  expectedClosingCash: Prisma.Decimal;
};

export type CashDrawerView =
  | { state: "EMPTY" }
  | {
      state: "OPENED_TODAY";
      session: CashDrawerSession;
      /** 僅 OPEN 狀態下計算的 live preview；CLOSED 時為 null（值已凍結在 session 欄位） */
      liveTotals: CashDrawerLiveTotals | null;
      /** 今日所有手動異動（提領/補入/調整），最新在上 */
      entries: CashDrawerEntry[];
    }
  | { state: "WARNING_LAST_OPEN"; lastSession: CashDrawerSession }
  | { state: "NOT_OPENED_TODAY"; lastSession: CashDrawerSession };

/** 純函式：根據 today session + latest session 推 view state。可單元測試。 */
export function deriveCashDrawerView(
  todaySession: CashDrawerSession | null,
  latestSessionOnOrBeforeToday: CashDrawerSession | null,
  todayLiveTotals: CashDrawerLiveTotals | null = null,
  todayEntries: CashDrawerEntry[] = [],
): CashDrawerView {
  if (todaySession) {
    return {
      state: "OPENED_TODAY",
      session: todaySession,
      liveTotals: todayLiveTotals,
      entries: todayEntries,
    };
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

/** 對 OPEN 狀態的 session 算 live preview（給閉店表單用）。pure-ish — 只讀 DB 不寫。 */
export async function computeLiveTotalsForOpenSession(
  session: CashDrawerSession,
): Promise<CashDrawerLiveTotals> {
  const [income, expense, manual] = await Promise.all([
    computeCashIncomeForSession(session),
    computeCashExpenseForSession(session),
    computeManualEntryTotals(session.id),
  ]);
  const expectedClosingCash = computeExpectedClosingCash({
    openingBookBalance: session.openingBookBalance,
    cashIncomeTotal: income,
    cashExpenseTotal: expense,
    cashWithdrawalTotal: manual.cashWithdrawalTotal,
    cashDepositTotal: manual.cashDepositTotal,
    cashAdjustmentTotal: manual.cashAdjustmentTotal,
  });
  return {
    cashIncomeTotal: income,
    cashExpenseTotal: expense,
    cashWithdrawalTotal: manual.cashWithdrawalTotal,
    cashDepositTotal: manual.cashDepositTotal,
    cashAdjustmentTotal: manual.cashAdjustmentTotal,
    expectedClosingCash,
  };
}

/** DB query + state 推導，給 page 用。OPEN 的今日 session 會額外計算 liveTotals。 */
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

  // 對今日 session（不論 OPEN/CLOSED）撈 entries 做列表顯示用
  // OPEN：給異動區塊與 live preview 用
  // CLOSED：給 read-only 歷史審視用
  const [liveTotals, entries] = todaySession
    ? await Promise.all([
        todaySession.status === "OPEN"
          ? computeLiveTotalsForOpenSession(todaySession)
          : Promise.resolve(null),
        prisma.cashDrawerEntry.findMany({
          where: { sessionId: todaySession.id },
          orderBy: { createdAt: "desc" },
        }),
      ])
    : [null, [] as CashDrawerEntry[]];

  return deriveCashDrawerView(todaySession, latestSession, liveTotals, entries);
}
