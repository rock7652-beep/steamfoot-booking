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
  computeCashbookCashMovementsForSession,
  computeExpectedClosingCash,
} from "@/server/services/cash-drawer";

export type CashDrawerLiveTotals = {
  cashIncomeTotal: Prisma.Decimal;
  cashExpenseTotal: Prisma.Decimal;
  cashWithdrawalTotal: Prisma.Decimal;
  cashDepositTotal: Prisma.Decimal;
  cashAdjustmentTotal: Prisma.Decimal;
  /** PR-3：當日現金帳（paymentMethod=CASH）INCOME 合計，推升結餘 */
  cashbookCashIncome: Prisma.Decimal;
  /** PR-3：當日現金帳（paymentMethod=CASH）EXPENSE + WITHDRAW 合計，壓低結餘 */
  cashbookCashOut: Prisma.Decimal;
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
  | {
      state: "WARNING_LAST_OPEN";
      lastSession: CashDrawerSession;
      /** 上一日 OPEN session 的即時統計，給「補關」表單顯示系統預估結餘 */
      liveTotals: CashDrawerLiveTotals;
    }
  | { state: "NOT_OPENED_TODAY"; lastSession: CashDrawerSession };

/** 純函式：根據 today session + latest session 推 view state。可單元測試。 */
export function deriveCashDrawerView(
  todaySession: CashDrawerSession | null,
  latestSessionOnOrBeforeToday: CashDrawerSession | null,
  todayLiveTotals: CashDrawerLiveTotals | null = null,
  todayEntries: CashDrawerEntry[] = [],
  warningLiveTotals: CashDrawerLiveTotals | null = null,
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
    if (!warningLiveTotals) {
      throw new Error(
        "deriveCashDrawerView: warningLiveTotals required when latest session is OPEN",
      );
    }
    return {
      state: "WARNING_LAST_OPEN",
      lastSession: latestSessionOnOrBeforeToday,
      liveTotals: warningLiveTotals,
    };
  }
  // CLOSED（或未來的 NEED_REVIEW，視同已結帳）
  return { state: "NOT_OPENED_TODAY", lastSession: latestSessionOnOrBeforeToday };
}

/** 對 OPEN 狀態的 session 算 live preview（給閉店表單用）。pure-ish — 只讀 DB 不寫。 */
export async function computeLiveTotalsForOpenSession(
  session: CashDrawerSession,
): Promise<CashDrawerLiveTotals> {
  const [income, expense, manual, cashbook] = await Promise.all([
    computeCashIncomeForSession(session),
    computeCashExpenseForSession(session),
    computeManualEntryTotals(session.id),
    computeCashbookCashMovementsForSession(session),
  ]);
  const expectedClosingCash = computeExpectedClosingCash({
    openingActualCash: session.openingActualCash,
    cashIncomeTotal: income,
    cashExpenseTotal: expense,
    cashWithdrawalTotal: manual.cashWithdrawalTotal,
    cashDepositTotal: manual.cashDepositTotal,
    cashAdjustmentTotal: manual.cashAdjustmentTotal,
    cashbookCashIncome: cashbook.cashbookCashIncome,
    cashbookCashOut: cashbook.cashbookCashOut,
  });
  return {
    cashIncomeTotal: income,
    cashExpenseTotal: expense,
    cashWithdrawalTotal: manual.cashWithdrawalTotal,
    cashDepositTotal: manual.cashDepositTotal,
    cashAdjustmentTotal: manual.cashAdjustmentTotal,
    cashbookCashIncome: cashbook.cashbookCashIncome,
    cashbookCashOut: cashbook.cashbookCashOut,
    expectedClosingCash,
  };
}

/**
 * PR-4：判斷某店某營業日的現金抽屜是否已 CLOSED。
 *
 * businessDate 必須是 UTC 午夜（與 CashDrawerSession.businessDate / @@unique 對齊）。
 * 供 cashbook server action 在 entryDate=該日 + paymentMethod=CASH 時做防呆 guard。
 * 純讀取，不重算任何快照。
 */
export async function isBusinessDateClosed(
  storeId: string,
  businessDate: Date,
): Promise<boolean> {
  const session = await prisma.cashDrawerSession.findUnique({
    where: { storeId_businessDate: { storeId, businessDate } },
    select: { status: true },
  });
  return session?.status === "CLOSED";
}

/**
 * PR-4：列出某店在 [fromDateStr, toDateStr]（含端點）區間內，所有已 CLOSED 的營業日，
 * 回傳 "YYYY-MM-DD" 字串陣列。供 cashbook new/edit 表單前端做「此日期已閉店」即時提示。
 *
 * 區間端點用 Date.UTC 轉 UTC 午夜，與 businessDate（@db.Date）對齊；
 * businessDate 讀出後 `.toISOString().slice(0,10)` 取日期字串是安全的（@db.Date UTC 午夜）。
 */
export async function listClosedBusinessDates(
  storeId: string,
  fromDateStr: string,
  toDateStr: string,
): Promise<string[]> {
  const [fy, fm, fd] = fromDateStr.split("-").map(Number);
  const [ty, tm, td] = toDateStr.split("-").map(Number);
  const from = new Date(Date.UTC(fy, fm - 1, fd));
  const to = new Date(Date.UTC(ty, tm - 1, td));
  const sessions = await prisma.cashDrawerSession.findMany({
    where: { storeId, status: "CLOSED", businessDate: { gte: from, lte: to } },
    select: { businessDate: true },
  });
  return sessions.map((s) => s.businessDate.toISOString().slice(0, 10));
}

/** DB query + state 推導，給 page 用。OPEN 的今日 session 會額外計算 liveTotals。
 *  若無今日 session、但 latestSession 仍 OPEN（上日忘記閉店），也會算 liveTotals
 *  給 WARNING_LAST_OPEN 卡片的「補關」表單顯示系統預估結餘。 */
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

  // 若沒今日 session、且 latestSession 仍 OPEN，給 WARNING_LAST_OPEN 算 liveTotals
  const warningLiveTotals =
    !todaySession && latestSession && latestSession.status === "OPEN"
      ? await computeLiveTotalsForOpenSession(latestSession)
      : null;

  return deriveCashDrawerView(
    todaySession,
    latestSession,
    liveTotals,
    entries,
    warningLiveTotals,
  );
}
