/**
 * Cash Drawer liveTotals 組合邏輯測試
 *
 * 驗證 `computeLiveTotalsForOpenSession` 對 OPEN session 的計算組合：
 *   - 正確呼叫 3 個 helper（income / expense / manual）
 *   - 用抽屜實體現金公式組合 expectedClosingCash
 *   - REFUND 負數翻正後當 expense
 *
 * 透過 mock prisma 層（既有 helper 內部會打 DB），不打真實 DB。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const {
  mockTxAggregate,
  mockEntryFindMany,
  mockCashbookGroupBy,
  dbMock,
} = vi.hoisted(() => {
  const fns = {
    mockTxAggregate: vi.fn(),
    mockEntryFindMany: vi.fn(),
    mockCashbookGroupBy: vi.fn(),
  };
  const db: Record<string, unknown> = {
    transaction: { aggregate: (...a: unknown[]) => fns.mockTxAggregate(...a) },
    cashDrawerEntry: {
      findMany: (...a: unknown[]) => fns.mockEntryFindMany(...a),
    },
    cashbookEntry: {
      groupBy: (...a: unknown[]) => fns.mockCashbookGroupBy(...a),
    },
    cashDrawerSession: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  };
  return { ...fns, dbMock: db };
});

vi.mock("@/lib/db", () => ({ prisma: dbMock }));

import { computeLiveTotalsForOpenSession } from "@/server/queries/cash-drawer";

const D = (n: number) => new Prisma.Decimal(n);

function makeOpenSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "sess-1",
    storeId: "store-zhubei",
    businessDate: new Date(Date.UTC(2026, 4, 15)),
    status: "OPEN",
    openingBookBalance: D(5000),
    openingActualCash: D(5000),
    openingDifference: D(0),
    openingNote: null,
    openedByUserId: "user-1",
    openedAt: new Date("2026-05-15T01:00:00Z"),
    cashIncomeTotal: D(0),
    cashExpenseTotal: D(0),
    cashWithdrawalTotal: D(0),
    cashDepositTotal: D(0),
    cashAdjustmentTotal: D(0),
    expectedClosingCash: null,
    closingActualCash: null,
    closingDifference: null,
    closingNote: null,
    closedByUserId: null,
    closedAt: null,
    finalBookBalance: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  // 預設無現金帳異動，個別測試可覆寫
  mockCashbookGroupBy.mockResolvedValue([]);
});

describe("computeLiveTotalsForOpenSession", () => {
  it("正確組合 income + expense + manual entries 並算 expectedClosingCash", async () => {
    // income：CASH SUCCESS 加總 8000
    // expense：REFUND 負數 -1000（翻正成 1000）
    // entries：提領 3000 (OUT)、補入 500 (IN)、調整 IN 100、調整 OUT 50
    mockTxAggregate
      .mockResolvedValueOnce({ _sum: { amount: D(8000) } }) // income (REVENUE_TYPES)
      .mockResolvedValueOnce({ _sum: { amount: D(0) } }) // non-cash income
      .mockResolvedValueOnce({ _sum: { amount: D(-1000) } }); // expense (REFUND)
    mockEntryFindMany.mockResolvedValue([
      { type: "CASH_WITHDRAWAL", direction: "OUT", amount: D(3000) },
      { type: "CASH_DEPOSIT", direction: "IN", amount: D(500) },
      { type: "CASH_ADJUSTMENT", direction: "IN", amount: D(100) },
      { type: "CASH_ADJUSTMENT", direction: "OUT", amount: D(50) },
    ]);

    const result = await computeLiveTotalsForOpenSession(
      makeOpenSession({ openingBookBalance: D(5000) }),
    );

    // 公式：opening + income - expense - withdrawal + deposit + adjustment(signed)
    //     = 5000 + 8000 - 1000 - 3000 + 500 + (100 - 50)
    //     = 9550
    expect(result.cashIncomeTotal.toNumber()).toBe(8000);
    expect(result.nonCashIncomeTotal.toNumber()).toBe(0);
    expect(result.todayPaymentTotal.toNumber()).toBe(8000);
    expect(result.cashExpenseTotal.toNumber()).toBe(1000); // 翻正
    expect(result.cashWithdrawalTotal.toNumber()).toBe(3000);
    expect(result.cashDepositTotal.toNumber()).toBe(500);
    expect(result.cashAdjustmentTotal.toNumber()).toBe(50); // 100 - 50 = signed
    expect(result.expectedClosingCash.toNumber()).toBe(9550);
  });

  it("無任何交易時 expectedClosingCash 等於 openingActualCash", async () => {
    mockTxAggregate.mockResolvedValue({ _sum: { amount: null } });
    mockEntryFindMany.mockResolvedValue([]);

    const result = await computeLiveTotalsForOpenSession(
      makeOpenSession({ openingBookBalance: D(5000), openingActualCash: D(5050), openingDifference: D(50) }),
    );

    // Decimal.neg() on zero produces -0 — use .equals(0) for sign-agnostic compare
    expect(result.cashIncomeTotal.equals(0)).toBe(true);
    expect(result.cashExpenseTotal.equals(0)).toBe(true);
    expect(result.expectedClosingCash.toNumber()).toBe(5050);
  });

  it("開店補入差額已在抽屜內，主數字應納入但不污染今日現金收入", async () => {
    mockTxAggregate
      .mockResolvedValueOnce({ _sum: { amount: D(798) } })
      .mockResolvedValueOnce({ _sum: { amount: D(0) } })
      .mockResolvedValueOnce({ _sum: { amount: D(0) } });
    mockEntryFindMany.mockResolvedValue([]);
    mockCashbookGroupBy.mockResolvedValue([
      { type: "EXPENSE", _sum: { amount: D(260) } },
    ]);

    const result = await computeLiveTotalsForOpenSession(
      makeOpenSession({
        openingBookBalance: D(1083),
        openingActualCash: D(1521),
        openingDifference: D(438),
      }),
    );

    expect(result.cashIncomeTotal.toNumber()).toBe(798);
    expect(result.todayPaymentTotal.toNumber()).toBe(798);
    expect(result.cashbookCashOut.toNumber()).toBe(260);
    expect(result.expectedClosingCash.toNumber()).toBe(2059);
  });

  it("開店短少差額會扣低抽屜實體應有現金，但不污染今日現金收入", async () => {
    mockTxAggregate
      .mockResolvedValueOnce({ _sum: { amount: D(798) } })
      .mockResolvedValueOnce({ _sum: { amount: D(0) } })
      .mockResolvedValueOnce({ _sum: { amount: D(0) } });
    mockEntryFindMany.mockResolvedValue([]);
    mockCashbookGroupBy.mockResolvedValue([
      { type: "EXPENSE", _sum: { amount: D(260) } },
    ]);

    const result = await computeLiveTotalsForOpenSession(
      makeOpenSession({
        openingBookBalance: D(1521),
        openingActualCash: D(1083),
        openingDifference: D(-438),
      }),
    );

    expect(result.cashIncomeTotal.toNumber()).toBe(798);
    expect(result.todayPaymentTotal.toNumber()).toBe(798);
    expect(result.cashbookCashOut.toNumber()).toBe(260);
    expect(result.expectedClosingCash.toNumber()).toBe(1621);
  });

  it("REFUND amount 為負數時 cashExpenseTotal 翻成正數量級（鐵則）", async () => {
    mockTxAggregate
      .mockResolvedValueOnce({ _sum: { amount: D(0) } }) // income
      .mockResolvedValueOnce({ _sum: { amount: D(0) } }) // non-cash income
      .mockResolvedValueOnce({ _sum: { amount: D(-500) } }); // expense (negative)
    mockEntryFindMany.mockResolvedValue([]);

    const result = await computeLiveTotalsForOpenSession(
      makeOpenSession({ openingBookBalance: D(1000), openingActualCash: D(1000) }),
    );

    expect(result.cashExpenseTotal.toNumber()).toBe(500); // 翻正後是 500
    // expectedClosingCash = 1000 - 500 = 500
    expect(result.expectedClosingCash.toNumber()).toBe(500);
  });

  it("非現金收入進今日收款合計，但不影響 expectedClosingCash", async () => {
    mockTxAggregate
      .mockResolvedValueOnce({ _sum: { amount: D(798) } }) // cash income
      .mockResolvedValueOnce({ _sum: { amount: D(1500) } }) // non-cash income
      .mockResolvedValueOnce({ _sum: { amount: D(0) } }); // cash refund
    mockEntryFindMany.mockResolvedValue([]);
    mockCashbookGroupBy.mockResolvedValue([
      { type: "EXPENSE", _sum: { amount: D(260) } },
    ]);

    const result = await computeLiveTotalsForOpenSession(
      makeOpenSession({
        openingBookBalance: D(1083),
        openingActualCash: D(1521),
        openingDifference: D(438),
      }),
    );

    expect(result.cashIncomeTotal.toNumber()).toBe(798);
    expect(result.nonCashIncomeTotal.toNumber()).toBe(1500);
    expect(result.todayPaymentTotal.toNumber()).toBe(2298);
    expect(result.cashbookCashOut.toNumber()).toBe(260);
    expect(result.expectedClosingCash.toNumber()).toBe(2059);
  });
});

describe("computeLiveTotalsForOpenSession — 現金帳（PR-3）", () => {
  it("現金帳 CASH INCOME 推升 expectedClosingCash", async () => {
    mockTxAggregate.mockResolvedValue({ _sum: { amount: D(0) } });
    mockEntryFindMany.mockResolvedValue([]);
    mockCashbookGroupBy.mockResolvedValue([{ type: "INCOME", _sum: { amount: D(1200) } }]);

    const result = await computeLiveTotalsForOpenSession(
      makeOpenSession({ openingBookBalance: D(1000), openingActualCash: D(1000) }),
    );

    expect(result.cashbookCashIncome.toNumber()).toBe(1200);
    expect(result.cashbookCashOut.equals(0)).toBe(true);
    // 1000 + 1200 = 2200
    expect(result.expectedClosingCash.toNumber()).toBe(2200);
  });

  it("現金帳 CASH EXPENSE + WITHDRAW 壓低 expectedClosingCash", async () => {
    mockTxAggregate.mockResolvedValue({ _sum: { amount: D(0) } });
    mockEntryFindMany.mockResolvedValue([]);
    mockCashbookGroupBy.mockResolvedValue([
      { type: "EXPENSE", _sum: { amount: D(300) } },
      { type: "WITHDRAW", _sum: { amount: D(700) } },
    ]);

    const result = await computeLiveTotalsForOpenSession(
      makeOpenSession({ openingBookBalance: D(5000), openingActualCash: D(5000) }),
    );

    expect(result.cashbookCashIncome.equals(0)).toBe(true);
    expect(result.cashbookCashOut.toNumber()).toBe(1000); // 300 + 700
    // 5000 - 1000 = 4000
    expect(result.expectedClosingCash.toNumber()).toBe(4000);
  });

  it("現金帳 ADJUSTMENT 不納入抽屜計算", async () => {
    mockTxAggregate.mockResolvedValue({ _sum: { amount: D(0) } });
    mockEntryFindMany.mockResolvedValue([]);
    mockCashbookGroupBy.mockResolvedValue([
      { type: "INCOME", _sum: { amount: D(500) } },
      { type: "ADJUSTMENT", _sum: { amount: D(9999) } },
    ]);

    const result = await computeLiveTotalsForOpenSession(
      makeOpenSession({ openingBookBalance: D(1000), openingActualCash: D(1000) }),
    );

    expect(result.cashbookCashIncome.toNumber()).toBe(500);
    expect(result.cashbookCashOut.equals(0)).toBe(true);
    // ADJUSTMENT 被忽略：1000 + 500 = 1500
    expect(result.expectedClosingCash.toNumber()).toBe(1500);
  });

  it("現金帳收支混合：income 推升、expense+withdraw 壓低", async () => {
    mockTxAggregate.mockResolvedValue({ _sum: { amount: D(0) } });
    mockEntryFindMany.mockResolvedValue([]);
    mockCashbookGroupBy.mockResolvedValue([
      { type: "INCOME", _sum: { amount: D(2000) } },
      { type: "EXPENSE", _sum: { amount: D(500) } },
      { type: "WITHDRAW", _sum: { amount: D(300) } },
    ]);

    const result = await computeLiveTotalsForOpenSession(
      makeOpenSession({ openingBookBalance: D(1000), openingActualCash: D(1000) }),
    );

    expect(result.cashbookCashIncome.toNumber()).toBe(2000);
    expect(result.cashbookCashOut.toNumber()).toBe(800);
    // 1000 + 2000 - 800 = 2200
    expect(result.expectedClosingCash.toNumber()).toBe(2200);
  });

  it("查詢條件：paymentMethod=CASH 且 entryDate 落在當日 day-range", async () => {
    mockTxAggregate.mockResolvedValue({ _sum: { amount: D(0) } });
    mockEntryFindMany.mockResolvedValue([]);
    mockCashbookGroupBy.mockResolvedValue([]);

    await computeLiveTotalsForOpenSession(
      makeOpenSession({
        storeId: "store-zhubei",
        businessDate: new Date(Date.UTC(2026, 4, 15)),
      }),
    );

    expect(mockCashbookGroupBy).toHaveBeenCalledTimes(1);
    const arg = mockCashbookGroupBy.mock.calls[0][0] as {
      by: string[];
      where: { storeId: string; paymentMethod: string; entryDate: { gte: Date; lt: Date } };
    };
    expect(arg.by).toEqual(["type"]);
    expect(arg.where.paymentMethod).toBe("CASH");
    expect(arg.where.storeId).toBe("store-zhubei");
    expect(arg.where.entryDate.gte).toEqual(new Date(Date.UTC(2026, 4, 15)));
    expect(arg.where.entryDate.lt).toEqual(new Date(Date.UTC(2026, 4, 16)));
  });
});
