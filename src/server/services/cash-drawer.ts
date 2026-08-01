/**
 * Cash Drawer 現金抽屜 — 純業務邏輯層
 *
 * 規格：docs/cash-drawer-spec.md
 *
 * 鐵則：
 *   1. CLOSED session 不可修改任何欄位（assertSessionMutable guard）
 *   2. (PR-5) finalBookBalance = closingActualCash：差額留在當天，下次開店從實際現金開始
 *   3. expectedClosingCash 用 openingActualCash：開店補入/短少差額已反映在實體抽屜現金
 *   4. REFUND.amount 為負數儲存，cashExpenseTotal 翻正後存入快照
 *   5. 顧客現金交易直接 query Transaction，不複寫到 CashDrawerEntry
 *
 * 排除的 transactionType（不進現金抽屜計算）：
 *   SESSION_DEDUCTION / MANUAL_USED_BACKFILL / PAPER_MIGRATION / ADJUSTMENT
 */

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { dayRange } from "@/lib/date-utils";
import type {
  CashDrawerSession,
  CashDrawerEntry,
  CashDrawerEntryType,
  CashDrawerDirection,
  PaymentMethod,
} from "@prisma/client";

const ZERO = new Prisma.Decimal(0);

const CASH_INCOME_TYPES = [
  "TRIAL_PURCHASE",
  "SINGLE_PURCHASE",
  "PACKAGE_PURCHASE",
  "SUPPLEMENT",
] as const;

const NON_CASH_INCOME_METHODS = [
  "TRANSFER",
  "LINE_PAY",
  "CREDIT_CARD",
  "OTHER",
] as const;

// ============================================================
// Pure helpers（無 DB 依賴，方便單元測試）
// ============================================================

export function computeOpeningDifference(
  actualCash: Prisma.Decimal,
  bookBalance: Prisma.Decimal,
): Prisma.Decimal {
  return actualCash.sub(bookBalance);
}

export function computeExpectedClosingCash(params: {
  openingActualCash: Prisma.Decimal;
  cashIncomeTotal: Prisma.Decimal;
  cashExpenseTotal: Prisma.Decimal;
  cashWithdrawalTotal: Prisma.Decimal;
  cashDepositTotal: Prisma.Decimal;
  cashAdjustmentTotal: Prisma.Decimal; // signed（IN 為正、OUT 為負）
  // PR-3: 現金帳（CashbookEntry）內 paymentMethod=CASH 的當日異動。
  // INCOME 推升結餘，EXPENSE + WITHDRAW 壓低結餘；ADJUSTMENT 不納入。
  cashbookCashIncome?: Prisma.Decimal;
  cashbookCashOut?: Prisma.Decimal;
}): Prisma.Decimal {
  return params.openingActualCash
    .add(params.cashIncomeTotal)
    .sub(params.cashExpenseTotal)
    .sub(params.cashWithdrawalTotal)
    .add(params.cashDepositTotal)
    .add(params.cashAdjustmentTotal)
    .add(params.cashbookCashIncome ?? ZERO)
    .sub(params.cashbookCashOut ?? ZERO);
}

export function computeClosingDifference(
  actualCash: Prisma.Decimal,
  expectedCash: Prisma.Decimal,
): Prisma.Decimal {
  return actualCash.sub(expectedCash);
}

export function assertSessionMutable(session: CashDrawerSession): void {
  if (session.status === "CLOSED") {
    throw new AppError(
      "BUSINESS_RULE",
      "此 session 已閉店鎖定，請在下一個 OPEN session 用 CASH_ADJUSTMENT 修正",
    );
  }
}

export function resolveDirectionForType(
  type: CashDrawerEntryType,
  explicit?: CashDrawerDirection,
): CashDrawerDirection {
  if (type === "CASH_WITHDRAWAL") return "OUT";
  if (type === "CASH_DEPOSIT") return "IN";
  // CASH_ADJUSTMENT 必須顯式指定
  if (!explicit) {
    throw new AppError("VALIDATION", "CASH_ADJUSTMENT 必須指定 direction (IN/OUT)");
  }
  return explicit;
}

// ============================================================
// DB helpers
// ============================================================

/** 取上一個已 CLOSED 的 session（同店、businessDate 早於指定日） */
export async function getLastClosedSession(
  storeId: string,
  beforeBusinessDate: Date,
): Promise<CashDrawerSession | null> {
  return prisma.cashDrawerSession.findFirst({
    where: {
      storeId,
      status: "CLOSED",
      businessDate: { lt: beforeBusinessDate },
    },
    orderBy: { businessDate: "desc" },
  });
}

/**
 * 交易現金收支的「營業日」時間窗。
 *
 * Transaction.transactionDate 是 timestamp（非 @db.Date），因此用 dayRange()
 * 取台灣營業日 [00:00, 23:59:59.999] 的 UTC 區間，而不是 businessDate(@db.Date,
 * UTC 午夜) ±24h —— 後者會變成 UTC 日，與台灣日整整偏移 8 小時。
 *
 * 與 computeCashbookCashMovementsForSession 的營業日語意一致：當日現金交易
 * 即使發生在「開店點錢」(openedAt) 之前，也算進當日抽屜（修正 openedAt..now
 * 時間窗會漏算白天現金、傍晚才開店時「今日現金收入 = 0」的 bug）。
 */
function businessDayWindow(businessDate: Date): { gte: Date; lte: Date } {
  // @db.Date 讀出後 toISOString().slice(0,10) 取 UTC 午夜日期字串是安全的
  const dateStr = businessDate.toISOString().slice(0, 10);
  const { start, end } = dayRange(dateStr);
  return { gte: start, lte: end };
}

/** 計算 session 營業日的現金收入（不含 REFUND）— 以台灣營業日 day-range 計，不看 openedAt */
export async function computeCashIncomeForSession(
  session: Pick<CashDrawerSession, "storeId" | "businessDate">,
): Promise<Prisma.Decimal> {
  return computeTransactionIncomeByPaymentMethods(session, ["CASH"]);
}

/**
 * New mixed-payment transactions are allocated by their child rows.  The
 * top-level paymentMethod remains a legacy fallback only, so a CASH +
 * TRANSFER sale never puts its entire amount into the cash drawer.
 */
async function computeTransactionIncomeByPaymentMethods(
  session: Pick<CashDrawerSession, "storeId" | "businessDate">,
  paymentMethods: readonly PaymentMethod[],
): Promise<Prisma.Decimal> {
  const transactionWhere: Prisma.TransactionWhereInput = {
    storeId: session.storeId,
    transactionType: { in: CASH_INCOME_TYPES as unknown as string[] as never },
    status: "SUCCESS",
    paymentStatus: { in: ["SUCCESS", "CONFIRMED"] },
    voidedAt: null,
    transactionDate: businessDayWindow(session.businessDate),
  };
  const [splitResult, legacyResult] = await Promise.all([
    prisma.transactionPaymentSplit.aggregate({
      _sum: { amount: true },
      where: {
        paymentMethod: { in: [...paymentMethods] },
        transaction: transactionWhere,
      },
    }),
    prisma.transaction.aggregate({
      _sum: { amount: true },
      where: {
        ...transactionWhere,
        paymentMethod: { in: [...paymentMethods] },
        paymentSplits: { none: {} },
      },
    }),
  ]);
  return (splitResult._sum?.amount ?? ZERO).add(legacyResult._sum?.amount ?? ZERO);
}

/** 計算 session 營業日的 Transaction 非現金收入（gross，不含退款）— 不影響 expectedClosingCash */
export async function computeTransactionNonCashIncomeForSession(
  session: Pick<CashDrawerSession, "storeId" | "businessDate">,
): Promise<Prisma.Decimal> {
  return computeTransactionIncomeByPaymentMethods(session, NON_CASH_INCOME_METHODS);
}

export async function computeCashbookIncomeOverviewForSession(
  session: Pick<CashDrawerSession, "storeId" | "businessDate">,
): Promise<{
  cashbookCashIncome: Prisma.Decimal;
  cashbookOtherIncome: Prisma.Decimal;
}> {
  const nextDay = new Date(session.businessDate.getTime() + 24 * 60 * 60 * 1000);
  const grouped = await prisma.cashbookEntry.groupBy({
    by: ["paymentMethod"],
    _sum: { amount: true },
    where: {
      storeId: session.storeId,
      type: "INCOME",
      paymentMethod: { in: ["CASH", "OTHER"] },
      entryDate: { gte: session.businessDate, lt: nextDay },
    },
  });

  let cashbookCashIncome = ZERO;
  let cashbookOtherIncome = ZERO;
  for (const g of grouped) {
    const sum = g._sum.amount ?? ZERO;
    if (g.paymentMethod === "CASH") {
      cashbookCashIncome = cashbookCashIncome.add(sum);
    } else if (g.paymentMethod === "OTHER") {
      cashbookOtherIncome = cashbookOtherIncome.add(sum);
    }
  }

  return { cashbookCashIncome, cashbookOtherIncome };
}

export async function computePaymentOverviewForSession(
  session: Pick<CashDrawerSession, "storeId" | "businessDate">,
  cashIncomeTotal?: Prisma.Decimal,
): Promise<{
  paymentOverviewCashIncomeTotal: Prisma.Decimal;
  nonCashIncomeTotal: Prisma.Decimal;
  todayPaymentTotal: Prisma.Decimal;
}> {
  const [transactionCashIncome, transactionNonCashIncome, cashbookIncome] = await Promise.all([
    cashIncomeTotal !== undefined
      ? Promise.resolve(cashIncomeTotal)
      : computeCashIncomeForSession(session),
    computeTransactionNonCashIncomeForSession(session),
    computeCashbookIncomeOverviewForSession(session),
  ]);
  const paymentOverviewCashIncomeTotal = transactionCashIncome.add(
    cashbookIncome.cashbookCashIncome,
  );
  const nonCashIncomeTotal = transactionNonCashIncome.add(cashbookIncome.cashbookOtherIncome);
  return {
    paymentOverviewCashIncomeTotal,
    nonCashIncomeTotal,
    todayPaymentTotal: paymentOverviewCashIncomeTotal.add(nonCashIncomeTotal),
  };
}

/** 計算 session 營業日的現金退款（REFUND amount 為負數，翻正回傳）— 同樣以營業日 day-range 計 */
export async function computeCashExpenseForSession(
  session: Pick<CashDrawerSession, "storeId" | "businessDate">,
): Promise<Prisma.Decimal> {
  const result = await prisma.transaction.aggregate({
    _sum: { amount: true },
    where: {
      storeId: session.storeId,
      paymentMethod: "CASH",
      transactionType: "REFUND",
      status: "SUCCESS",
      voidedAt: null,
      transactionDate: businessDayWindow(session.businessDate),
    },
  });
  const refundSum = result._sum.amount ?? ZERO;
  // REFUND.amount 為負數；翻成正數量級存入快照
  return refundSum.neg();
}

/** 計算 session 內手動異動的彙總（withdrawal / deposit / adjustment） */
export async function computeManualEntryTotals(sessionId: string): Promise<{
  cashWithdrawalTotal: Prisma.Decimal;
  cashDepositTotal: Prisma.Decimal;
  cashAdjustmentTotal: Prisma.Decimal;
}> {
  const entries = await prisma.cashDrawerEntry.findMany({
    where: { sessionId },
    select: { type: true, direction: true, amount: true },
  });

  let withdrawal = ZERO;
  let deposit = ZERO;
  let adjustment = ZERO; // signed

  for (const e of entries) {
    if (e.type === "CASH_WITHDRAWAL") {
      withdrawal = withdrawal.add(e.amount);
    } else if (e.type === "CASH_DEPOSIT") {
      deposit = deposit.add(e.amount);
    } else if (e.type === "CASH_ADJUSTMENT") {
      adjustment = e.direction === "IN" ? adjustment.add(e.amount) : adjustment.sub(e.amount);
    }
  }

  return {
    cashWithdrawalTotal: withdrawal,
    cashDepositTotal: deposit,
    cashAdjustmentTotal: adjustment,
  };
}

export type CashbookCashMovements = {
  /** 現金帳 INCOME（paymentMethod=CASH）合計 — 推升抽屜結餘 */
  cashbookCashIncome: Prisma.Decimal;
  /** 現金帳 EXPENSE + WITHDRAW（paymentMethod=CASH）合計 — 壓低抽屜結餘 */
  cashbookCashOut: Prisma.Decimal;
};

/**
 * 計算某 session 營業日的「現金帳現金異動」。
 *
 * 只納入 CashbookEntry.paymentMethod = CASH，且 entryDate 落在該營業日；
 * INCOME 累進 cashbookCashIncome、EXPENSE + WITHDRAW 累進 cashbookCashOut。
 * ADJUSTMENT 不納入（無方向欄位，與既有現金抽屜彙總一致）。
 *
 * entryDate 與 businessDate 同為 @db.Date（UTC 午夜），用 [businessDate, +1d) day-range 比對，
 * 不使用 Transaction 的 openedAt/closedAt 時戳窗（避免把 date-only 欄位當成時戳）。
 */
export async function computeCashbookCashMovementsForSession(
  session: Pick<CashDrawerSession, "storeId" | "businessDate">,
): Promise<CashbookCashMovements> {
  const nextDay = new Date(session.businessDate.getTime() + 24 * 60 * 60 * 1000);
  const grouped = await prisma.cashbookEntry.groupBy({
    by: ["type"],
    _sum: { amount: true },
    where: {
      storeId: session.storeId,
      paymentMethod: "CASH",
      entryDate: { gte: session.businessDate, lt: nextDay },
    },
  });

  let income = ZERO;
  let out = ZERO;
  for (const g of grouped) {
    const sum = g._sum.amount ?? ZERO;
    if (g.type === "INCOME") {
      income = income.add(sum);
    } else if (g.type === "EXPENSE" || g.type === "WITHDRAW") {
      out = out.add(sum);
    }
    // ADJUSTMENT：略過（不納入抽屜計算）
  }

  return { cashbookCashIncome: income, cashbookCashOut: out };
}

// ============================================================
// Public service functions
// ============================================================

export type InitializeInput = {
  storeId: string;
  businessDate: Date;
  openingBookBalance: number | Prisma.Decimal;
  openingActualCash: number | Prisma.Decimal;
  note?: string;
  actorUserId: string;
};

/**
 * 第一次啟用 — 由 OWNER 手動輸入初始現金。
 * 同店若已有任何 session，拒絕（避免覆蓋既有滾動結餘）。
 */
export async function initializeCashDrawer(input: InitializeInput): Promise<CashDrawerSession> {
  const existing = await prisma.cashDrawerSession.findFirst({
    where: { storeId: input.storeId },
  });
  if (existing) {
    throw new AppError(
      "CONFLICT",
      "此店已有現金抽屜紀錄，請改用 openCashDrawer 開始今日 session",
    );
  }

  const bookBalance = new Prisma.Decimal(input.openingBookBalance);
  const actualCash = new Prisma.Decimal(input.openingActualCash);
  const difference = computeOpeningDifference(actualCash, bookBalance);

  if (!difference.eq(ZERO) && !input.note) {
    throw new AppError("VALIDATION", "初始現金差額不為 0 時必須填寫備註");
  }

  return prisma.cashDrawerSession.create({
    data: {
      storeId: input.storeId,
      businessDate: input.businessDate,
      status: "OPEN",
      openingBookBalance: bookBalance,
      openingActualCash: actualCash,
      openingDifference: difference,
      openingNote: input.note,
      openedByUserId: input.actorUserId,
    },
  });
}

export type OpenInput = {
  storeId: string;
  businessDate: Date;
  openingActualCash: number | Prisma.Decimal;
  note?: string;
  actorUserId: string;
};

/**
 * 開店點錢 — 帶入上日 finalBookBalance 作為 openingBookBalance。
 * 若無上日 CLOSED session：拒絕（要求 OWNER 走 initializeCashDrawer）。
 */
export async function openCashDrawer(input: OpenInput): Promise<CashDrawerSession> {
  const lastClosed = await getLastClosedSession(input.storeId, input.businessDate);
  if (!lastClosed || lastClosed.finalBookBalance == null) {
    throw new AppError(
      "BUSINESS_RULE",
      "找不到上一個已閉店的 session，請先用 initializeCashDrawer 建立第一筆",
    );
  }

  const bookBalance = lastClosed.finalBookBalance;
  const actualCash = new Prisma.Decimal(input.openingActualCash);
  const difference = computeOpeningDifference(actualCash, bookBalance);

  if (!difference.eq(ZERO) && !input.note) {
    throw new AppError("VALIDATION", "開店差額不為 0 時必須填寫備註");
  }

  return prisma.cashDrawerSession.create({
    data: {
      storeId: input.storeId,
      businessDate: input.businessDate,
      status: "OPEN",
      openingBookBalance: bookBalance,
      openingActualCash: actualCash,
      openingDifference: difference,
      openingNote: input.note,
      openedByUserId: input.actorUserId,
    },
  });
}

export type CurrentCashDrawer = {
  session: CashDrawerSession | null;
  liveTotals: {
    cashIncomeTotal: Prisma.Decimal;
    paymentOverviewCashIncomeTotal: Prisma.Decimal;
    nonCashIncomeTotal: Prisma.Decimal;
    todayPaymentTotal: Prisma.Decimal;
    cashExpenseTotal: Prisma.Decimal;
    cashWithdrawalTotal: Prisma.Decimal;
    cashDepositTotal: Prisma.Decimal;
    cashAdjustmentTotal: Prisma.Decimal;
    cashbookCashIncome: Prisma.Decimal;
    cashbookCashOut: Prisma.Decimal;
    expectedClosingCash: Prisma.Decimal;
  } | null;
};

/**
 * 取得指定店指定日的 session + 即時統計（不寫入快照欄位）。
 * 若該日無 session，session 為 null。
 *
 * PR-3：CLOSED session 不 live 重算（含現金帳），直接回 liveTotals=null，
 * 由 caller 改讀 frozen 快照欄位，維持閉店凍結。
 */
export async function getCurrentCashDrawer(
  storeId: string,
  businessDate: Date,
): Promise<CurrentCashDrawer> {
  const session = await prisma.cashDrawerSession.findUnique({
    where: { storeId_businessDate: { storeId, businessDate } },
  });
  if (!session) {
    return { session: null, liveTotals: null };
  }
  if (session.status === "CLOSED") {
    // 閉店凍結：不回頭重算，liveTotals 為 null（caller 讀 session 快照欄位）
    return { session, liveTotals: null };
  }

  const [
    cashIncomeTotal,
    transactionNonCashIncomeTotal,
    cashExpenseTotal,
    manual,
    cashbook,
    cashbookIncome,
  ] = await Promise.all([
    computeCashIncomeForSession(session),
    computeTransactionNonCashIncomeForSession(session),
    computeCashExpenseForSession(session),
    computeManualEntryTotals(session.id),
    computeCashbookCashMovementsForSession(session),
    computeCashbookIncomeOverviewForSession(session),
  ]);
  const paymentOverviewCashIncomeTotal = cashIncomeTotal.add(
    cashbookIncome.cashbookCashIncome,
  );
  const nonCashIncomeTotal = transactionNonCashIncomeTotal.add(
    cashbookIncome.cashbookOtherIncome,
  );

  const expectedClosingCash = computeExpectedClosingCash({
    openingActualCash: session.openingActualCash,
    cashIncomeTotal,
    cashExpenseTotal,
    cashWithdrawalTotal: manual.cashWithdrawalTotal,
    cashDepositTotal: manual.cashDepositTotal,
    cashAdjustmentTotal: manual.cashAdjustmentTotal,
    cashbookCashIncome: cashbook.cashbookCashIncome,
    cashbookCashOut: cashbook.cashbookCashOut,
  });

  return {
    session,
    liveTotals: {
      cashIncomeTotal,
      paymentOverviewCashIncomeTotal,
      nonCashIncomeTotal,
      todayPaymentTotal: paymentOverviewCashIncomeTotal.add(nonCashIncomeTotal),
      cashExpenseTotal,
      cashWithdrawalTotal: manual.cashWithdrawalTotal,
      cashDepositTotal: manual.cashDepositTotal,
      cashAdjustmentTotal: manual.cashAdjustmentTotal,
      cashbookCashIncome: cashbook.cashbookCashIncome,
      cashbookCashOut: cashbook.cashbookCashOut,
      expectedClosingCash,
    },
  };
}

export type AddEntryInput = {
  sessionId: string;
  type: CashDrawerEntryType;
  direction?: CashDrawerDirection; // 只在 CASH_ADJUSTMENT 時必填
  amount: number | Prisma.Decimal;
  reason: string;
  note?: string;
  actorUserId: string;
};

/** 新增手動異動（提領 / 補入 / 調整）。CLOSED session 拒絕。 */
export async function addCashDrawerEntry(input: AddEntryInput): Promise<CashDrawerEntry> {
  const session = await prisma.cashDrawerSession.findUnique({ where: { id: input.sessionId } });
  if (!session) {
    throw new AppError("NOT_FOUND", "找不到指定的現金抽屜 session");
  }
  assertSessionMutable(session);

  const amount = new Prisma.Decimal(input.amount);
  if (amount.lte(ZERO)) {
    throw new AppError("VALIDATION", "金額必須大於 0");
  }
  if (!input.reason || input.reason.trim().length === 0) {
    throw new AppError("VALIDATION", "原因必填");
  }
  const direction = resolveDirectionForType(input.type, input.direction);

  return prisma.cashDrawerEntry.create({
    data: {
      storeId: session.storeId,
      sessionId: input.sessionId,
      businessDate: session.businessDate,
      type: input.type,
      direction,
      amount,
      reason: input.reason,
      note: input.note,
      createdByUserId: input.actorUserId,
    },
  });
}

export type CloseInput = {
  sessionId: string;
  closingActualCash: number | Prisma.Decimal;
  note?: string;
  actorUserId: string;
};

/**
 * 閉店點錢 — 凍結快照、計算 expectedClosingCash / closingDifference、status=CLOSED。
 *
 * PR-5：差額留在當天，下次開店從實際現金開始。
 * finalBookBalance = closingActualCash（不是 expected），讓隔天開店自然接續「昨天實際點到的現金」，
 * 避免差額被帶著跑、每天越差越多。當天的短溢仍完整保留在 closingDifference / closingNote。
 *
 * 設計：讀取與計算階段在 transaction **外**進行（避免 Prisma interactive
 * transaction 5s timeout，因為 Supabase pooler 上每個 connection 是分開的）。
 * 寫入只用單一 update + `where: { status: "OPEN" }` 達成 optimistic concurrency：
 * 若期間 status 變了，Prisma 會丟 P2025（rare race condition，由 caller 重試）。
 */
export async function closeCashDrawer(input: CloseInput): Promise<CashDrawerSession> {
  // ── 1. Read phase（不在 transaction 內）──
  const session = await prisma.cashDrawerSession.findUnique({
    where: { id: input.sessionId },
  });
  if (!session) {
    throw new AppError("NOT_FOUND", "找不到指定的現金抽屜 session");
  }
  if (session.status === "CLOSED") {
    throw new AppError("BUSINESS_RULE", "此 session 已閉店，不可重複關閉");
  }

  const closedAt = new Date();

  // ── 2. Compute phase（並行讀取 + 純函式計算）──
  // 現金收入/退款以營業日 day-range 計（不再用 openedAt..closedAt 時間窗），
  // 故不需把 closedAt 傳進去；closedAt 仍用於下方快照寫入。
  const [cashIncomeTotal, cashExpenseTotal, cashbook] = await Promise.all([
    computeCashIncomeForSession(session),
    computeCashExpenseForSession(session),
    // PR-3：閉店快照納入當日現金帳 CASH 異動（折進 expectedClosingCash）
    computeCashbookCashMovementsForSession(session),
  ]);

  const entries = await prisma.cashDrawerEntry.findMany({
    where: { sessionId: session.id },
    select: { type: true, direction: true, amount: true },
  });
  let withdrawal = ZERO;
  let deposit = ZERO;
  let adjustment = ZERO;
  for (const e of entries) {
    if (e.type === "CASH_WITHDRAWAL") withdrawal = withdrawal.add(e.amount);
    else if (e.type === "CASH_DEPOSIT") deposit = deposit.add(e.amount);
    else if (e.type === "CASH_ADJUSTMENT")
      adjustment = e.direction === "IN" ? adjustment.add(e.amount) : adjustment.sub(e.amount);
  }

  const expectedClosingCash = computeExpectedClosingCash({
    openingActualCash: session.openingActualCash,
    cashIncomeTotal,
    cashExpenseTotal,
    cashWithdrawalTotal: withdrawal,
    cashDepositTotal: deposit,
    cashAdjustmentTotal: adjustment,
    cashbookCashIncome: cashbook.cashbookCashIncome,
    cashbookCashOut: cashbook.cashbookCashOut,
  });
  const closingActualCash = new Prisma.Decimal(input.closingActualCash);
  const closingDifference = computeClosingDifference(closingActualCash, expectedClosingCash);

  if (!closingDifference.eq(ZERO) && !input.note) {
    throw new AppError("VALIDATION", "閉店差額不為 0 時必須填寫備註");
  }

  // ── 3. Write phase（單一 atomic update，沒包 transaction）──
  // where: { id, status: "OPEN" } 提供 optimistic concurrency；
  // 若 race condition 期間 status 已被改 CLOSED，Prisma 丟 P2025 — caller 重試即可。
  return prisma.cashDrawerSession.update({
    where: { id: session.id, status: "OPEN" },
    data: {
      status: "CLOSED",
      cashIncomeTotal,
      cashExpenseTotal,
      cashWithdrawalTotal: withdrawal,
      cashDepositTotal: deposit,
      cashAdjustmentTotal: adjustment,
      expectedClosingCash,
      closingActualCash,
      closingDifference,
      closingNote: input.note,
      closedByUserId: input.actorUserId,
      closedAt,
      // PR-5：差額留在當天，下次開店從實際現金開始。
      // finalBookBalance = closingActualCash（不是 expected），讓隔天開店 openingBookBalance
      // 自然接續「昨天實際點到的現金」；當天的短溢仍保留在 closingDifference / closingNote。
      finalBookBalance: closingActualCash,
    },
  });
}
