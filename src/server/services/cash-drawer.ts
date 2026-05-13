/**
 * Cash Drawer 現金抽屜 — 純業務邏輯層
 *
 * 規格：docs/cash-drawer-spec.md
 *
 * 鐵則：
 *   1. CLOSED session 不可修改任何欄位（assertSessionMutable guard）
 *   2. finalBookBalance = expectedClosingCash（不是 closingActualCash），維持帳面責任鏈
 *   3. expectedClosingCash 用 openingBookBalance（不是 openingActualCash）
 *   4. REFUND.amount 為負數儲存，cashExpenseTotal 翻正後存入快照
 *   5. 顧客現金交易直接 query Transaction，不複寫到 CashDrawerEntry
 *
 * 排除的 transactionType（不進現金抽屜計算）：
 *   SESSION_DEDUCTION / MANUAL_USED_BACKFILL / PAPER_MIGRATION / ADJUSTMENT
 */

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import type {
  CashDrawerSession,
  CashDrawerEntry,
  CashDrawerEntryType,
  CashDrawerDirection,
} from "@prisma/client";

const ZERO = new Prisma.Decimal(0);

const CASH_INCOME_TYPES = [
  "TRIAL_PURCHASE",
  "SINGLE_PURCHASE",
  "PACKAGE_PURCHASE",
  "SUPPLEMENT",
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
  openingBookBalance: Prisma.Decimal;
  cashIncomeTotal: Prisma.Decimal;
  cashExpenseTotal: Prisma.Decimal;
  cashWithdrawalTotal: Prisma.Decimal;
  cashDepositTotal: Prisma.Decimal;
  cashAdjustmentTotal: Prisma.Decimal; // signed（IN 為正、OUT 為負）
}): Prisma.Decimal {
  return params.openingBookBalance
    .add(params.cashIncomeTotal)
    .sub(params.cashExpenseTotal)
    .sub(params.cashWithdrawalTotal)
    .add(params.cashDepositTotal)
    .add(params.cashAdjustmentTotal);
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

/** 計算 session 期間的現金收入（不含 REFUND） */
export async function computeCashIncomeForSession(
  session: Pick<CashDrawerSession, "storeId" | "openedAt" | "closedAt">,
): Promise<Prisma.Decimal> {
  const result = await prisma.transaction.aggregate({
    _sum: { amount: true },
    where: {
      storeId: session.storeId,
      paymentMethod: "CASH",
      transactionType: { in: CASH_INCOME_TYPES as unknown as string[] as never },
      status: "SUCCESS",
      paymentStatus: { in: ["SUCCESS", "CONFIRMED"] },
      voidedAt: null,
      transactionDate: {
        gte: session.openedAt,
        lte: session.closedAt ?? new Date(),
      },
    },
  });
  return result._sum.amount ?? ZERO;
}

/** 計算 session 期間的現金退款（REFUND amount 為負數，翻正回傳） */
export async function computeCashExpenseForSession(
  session: Pick<CashDrawerSession, "storeId" | "openedAt" | "closedAt">,
): Promise<Prisma.Decimal> {
  const result = await prisma.transaction.aggregate({
    _sum: { amount: true },
    where: {
      storeId: session.storeId,
      paymentMethod: "CASH",
      transactionType: "REFUND",
      status: "SUCCESS",
      voidedAt: null,
      transactionDate: {
        gte: session.openedAt,
        lte: session.closedAt ?? new Date(),
      },
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
    cashExpenseTotal: Prisma.Decimal;
    cashWithdrawalTotal: Prisma.Decimal;
    cashDepositTotal: Prisma.Decimal;
    cashAdjustmentTotal: Prisma.Decimal;
    expectedClosingCash: Prisma.Decimal;
  } | null;
};

/**
 * 取得指定店指定日的 session + 即時統計（不寫入快照欄位）。
 * 若該日無 session，session 為 null。
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

  const [cashIncomeTotal, cashExpenseTotal, manual] = await Promise.all([
    computeCashIncomeForSession(session),
    computeCashExpenseForSession(session),
    computeManualEntryTotals(session.id),
  ]);

  const expectedClosingCash = computeExpectedClosingCash({
    openingBookBalance: session.openingBookBalance,
    cashIncomeTotal,
    cashExpenseTotal,
    cashWithdrawalTotal: manual.cashWithdrawalTotal,
    cashDepositTotal: manual.cashDepositTotal,
    cashAdjustmentTotal: manual.cashAdjustmentTotal,
  });

  return {
    session,
    liveTotals: {
      cashIncomeTotal,
      cashExpenseTotal,
      cashWithdrawalTotal: manual.cashWithdrawalTotal,
      cashDepositTotal: manual.cashDepositTotal,
      cashAdjustmentTotal: manual.cashAdjustmentTotal,
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
 * finalBookBalance = expectedClosingCash（不是 closingActualCash），避免短溢被默默吃進結餘鏈。
 * 若實際與帳面有差，差額留在 closingDifference / closingNote 並要求填寫原因。
 */
export async function closeCashDrawer(input: CloseInput): Promise<CashDrawerSession> {
  return prisma.$transaction(async (tx) => {
    const session = await tx.cashDrawerSession.findUnique({ where: { id: input.sessionId } });
    if (!session) {
      throw new AppError("NOT_FOUND", "找不到指定的現金抽屜 session");
    }
    if (session.status === "CLOSED") {
      throw new AppError("BUSINESS_RULE", "此 session 已閉店，不可重複關閉");
    }

    const closedAt = new Date();

    // 凍結快照所需的 income/expense/manual
    const [cashIncomeTotal, cashExpenseTotal] = await Promise.all([
      computeCashIncomeForSession({ ...session, closedAt }),
      computeCashExpenseForSession({ ...session, closedAt }),
    ]);

    const entries = await tx.cashDrawerEntry.findMany({
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
      openingBookBalance: session.openingBookBalance,
      cashIncomeTotal,
      cashExpenseTotal,
      cashWithdrawalTotal: withdrawal,
      cashDepositTotal: deposit,
      cashAdjustmentTotal: adjustment,
    });
    const closingActualCash = new Prisma.Decimal(input.closingActualCash);
    const closingDifference = computeClosingDifference(closingActualCash, expectedClosingCash);

    if (!closingDifference.eq(ZERO) && !input.note) {
      throw new AppError("VALIDATION", "閉店差額不為 0 時必須填寫備註");
    }

    return tx.cashDrawerSession.update({
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
        // 維持帳面責任鏈：finalBookBalance 用 expected 而非 actual
        finalBookBalance: expectedClosingCash,
      },
    });
  });
}
