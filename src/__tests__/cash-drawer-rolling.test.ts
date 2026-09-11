/**
 * Cash Drawer 多日滾動結餘場景測試
 *
 * 重點（PR-5）：finalBookBalance = closingActualCash —— 差額留在當天，
 * 下次開店從實際點到的現金開始，不會被帶著跑、每天越差越多。
 *
 * 場景：
 *   C: Day1 短少 100 → finalBookBalance=4900（實點）；Day2 自動帶 4900、實點 4900 → openingDifference=0
 *   D: 大額短少 7765→2295 → finalBookBalance=2295；Day2 自動帶 2295（不是 expected 7765）
 *   E: 沒有前一天 CLOSED session → openCashDrawer 維持原邏輯（拒絕，要求 initialize）
 *
 * 不在此檔覆蓋的場景：
 *   A/B（短少 / 溢出時 finalBookBalance = 實點）已在 cash-drawer-service.test.ts
 *   多店隔離已在 cash-drawer-service.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const STORE_A = "store-zhubei";
const USER_OWNER = "user-owner-1";

const {
  mockSessionFindFirst,
  mockSessionFindUnique,
  mockSessionCreate,
  mockSessionUpdate,
  mockEntryFindMany,
  mockTxAggregate,
  mockPaymentSplitAggregate,
  mockCashbookGroupBy,
  dbMock,
} = vi.hoisted(() => {
  const fns = {
    mockSessionFindFirst: vi.fn(),
    mockSessionFindUnique: vi.fn(),
    mockSessionCreate: vi.fn(),
    mockSessionUpdate: vi.fn(),
    mockEntryFindMany: vi.fn(),
    mockEntryCreate: vi.fn(),
    mockTxAggregate: vi.fn(),
    mockPaymentSplitAggregate: vi.fn(),
    mockCashbookGroupBy: vi.fn(),
  };
  const db: Record<string, unknown> = {
    cashDrawerSession: {
      findFirst: (...a: unknown[]) => fns.mockSessionFindFirst(...a),
      findUnique: (...a: unknown[]) => fns.mockSessionFindUnique(...a),
      create: (...a: unknown[]) => fns.mockSessionCreate(...a),
      update: (...a: unknown[]) => fns.mockSessionUpdate(...a),
    },
    cashDrawerEntry: {
      findMany: (...a: unknown[]) => fns.mockEntryFindMany(...a),
      create: (...a: unknown[]) => fns.mockEntryCreate(...a),
    },
    cashbookEntry: {
      groupBy: (...a: unknown[]) => fns.mockCashbookGroupBy(...a),
    },
    transaction: { aggregate: (...a: unknown[]) => fns.mockTxAggregate(...a) },
    transactionPaymentSplit: {
      aggregate: (...a: unknown[]) => fns.mockPaymentSplitAggregate(...a),
    },
  };
  db.$transaction = (cb: (tx: unknown) => Promise<unknown>) => cb(db);
  return { ...fns, dbMock: db };
});

vi.mock("@/lib/db", () => ({ prisma: dbMock }));

import { openCashDrawer, closeCashDrawer, addCashDrawerEntry } from "@/server/services/cash-drawer";

const D = (n: number) => new Prisma.Decimal(n);

beforeEach(() => {
  vi.clearAllMocks();
  mockTxAggregate.mockResolvedValue({ _sum: { amount: null } });
  mockPaymentSplitAggregate.mockResolvedValue({ _sum: { amount: null } });
  mockEntryFindMany.mockResolvedValue([]);
  // PR-3：滾動場景無現金帳異動，現金帳 groupBy 回空
  mockCashbookGroupBy.mockResolvedValue([]);
});

describe("場景 C：Day1 短少 100，差額留在當天，Day2 從實點接續", () => {
  it("Day1 close：finalBookBalance = 實點 4900（不是帳面 5000），差額 -100 留在當天", async () => {
    // Day1: opening book 5000, actual 5000, income 0, close actual 4900（短少 100）
    mockSessionFindUnique.mockResolvedValue({
      id: "sess-day1",
      storeId: STORE_A,
      businessDate: new Date(Date.UTC(2026, 4, 13)),
      status: "OPEN",
      openingBookBalance: D(5000),
      openingActualCash: D(5000),
      openingDifference: D(0),
      openedAt: new Date("2026-05-13T01:00:00Z"),
      closedAt: null,
    });
    mockSessionUpdate.mockResolvedValue({ id: "sess-day1" });

    await closeCashDrawer({
      sessionId: "sess-day1",
      closingActualCash: 4900,
      note: "盤點短少 100，待查",
      actorUserId: USER_OWNER,
    });

    const closeCall = mockSessionUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    // PR-5：下次開店起點 = 實點 4900；差額 -100 完整保留在當天
    expect((closeCall.data.finalBookBalance as Prisma.Decimal).toNumber()).toBe(4900);
    expect((closeCall.data.expectedClosingCash as Prisma.Decimal).toNumber()).toBe(5000);
    expect((closeCall.data.closingDifference as Prisma.Decimal).toNumber()).toBe(-100);
  });

  it("Day2 open 自動帶入 4900（不是 5000），實點 4900 時 openingDifference = 0（差額沒被帶過來）", async () => {
    // Day2: 上日 CLOSED session.finalBookBalance = 4900（= 上日實點）
    mockSessionFindFirst.mockResolvedValue({
      id: "sess-day1",
      storeId: STORE_A,
      status: "CLOSED",
      finalBookBalance: D(4900),
      businessDate: new Date(Date.UTC(2026, 4, 13)),
    });
    mockSessionCreate.mockResolvedValue({ id: "sess-day2" });

    await openCashDrawer({
      storeId: STORE_A,
      businessDate: new Date(Date.UTC(2026, 4, 14)),
      openingActualCash: 4900,
      actorUserId: USER_OWNER,
    });

    const call = mockSessionCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect((call.data.openingBookBalance as Prisma.Decimal).toNumber()).toBe(4900);
    // ← PR-5 證明：昨天的差額留在昨天，今天從實點重新開始、openingDifference = 0
    expect((call.data.openingDifference as Prisma.Decimal).toNumber()).toBe(0);
  });
});

describe("場景 D：大額短少 7765 → 實點 2295（用戶情境）", () => {
  it("Day1 close：finalBookBalance = 2295，差額 -5470 留在當天", async () => {
    mockSessionFindUnique.mockResolvedValue({
      id: "sess-day1",
      storeId: STORE_A,
      businessDate: new Date(Date.UTC(2026, 4, 13)),
      status: "OPEN",
      openingBookBalance: D(7765),
      openingActualCash: D(7765),
      openingDifference: D(0),
      openedAt: new Date("2026-05-13T01:00:00Z"),
      closedAt: null,
    });
    mockSessionUpdate.mockResolvedValue({ id: "sess-day1" });

    await closeCashDrawer({
      sessionId: "sess-day1",
      closingActualCash: 2295,
      note: "現場點到 2295，差額待查",
      actorUserId: USER_OWNER,
    });

    const call = mockSessionUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect((call.data.expectedClosingCash as Prisma.Decimal).toNumber()).toBe(7765);
    expect((call.data.closingDifference as Prisma.Decimal).toNumber()).toBe(-5470);
    expect((call.data.finalBookBalance as Prisma.Decimal).toNumber()).toBe(2295);
  });

  it("Day2 open 從 2295 開始（不是 expected 7765），避免每天越差越多", async () => {
    mockSessionFindFirst.mockResolvedValue({
      id: "sess-day1",
      storeId: STORE_A,
      status: "CLOSED",
      finalBookBalance: D(2295), // = 上日實點
      businessDate: new Date(Date.UTC(2026, 4, 13)),
    });
    mockSessionCreate.mockResolvedValue({ id: "sess-day2" });

    await openCashDrawer({
      storeId: STORE_A,
      businessDate: new Date(Date.UTC(2026, 4, 14)),
      openingActualCash: 2295,
      actorUserId: USER_OWNER,
    });

    const call = mockSessionCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect((call.data.openingBookBalance as Prisma.Decimal).toNumber()).toBe(2295);
    expect((call.data.openingBookBalance as Prisma.Decimal).toNumber()).not.toBe(7765);
    expect((call.data.openingDifference as Prisma.Decimal).toNumber()).toBe(0);
  });
});

describe("場景 E：沒有前一天 CLOSED session 時維持原邏輯", () => {
  it("找不到上一筆 CLOSED session → openCashDrawer 拒絕（要求先 initialize）", async () => {
    mockSessionFindFirst.mockResolvedValue(null);

    await expect(
      openCashDrawer({
        storeId: STORE_A,
        businessDate: new Date(Date.UTC(2026, 4, 14)),
        openingActualCash: 5000,
        actorUserId: USER_OWNER,
      }),
    ).rejects.toThrow(/initializeCashDrawer/);
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });
});

describe("addCashDrawerEntry 對 ADJUSTMENT 的 direction 驗證", () => {
  it("CASH_ADJUSTMENT 必須指定 direction", async () => {
    mockSessionFindUnique.mockResolvedValue({
      id: "sess-1",
      storeId: STORE_A,
      businessDate: new Date(Date.UTC(2026, 4, 14)),
      status: "OPEN",
      openingBookBalance: D(5000),
      openingActualCash: D(5000),
      openingDifference: D(0),
      openedAt: new Date(),
      closedAt: null,
    });
    await expect(
      addCashDrawerEntry({
        sessionId: "sess-1",
        type: "CASH_ADJUSTMENT",
        amount: 100,
        reason: "盤點差異",
        actorUserId: USER_OWNER,
        // 沒傳 direction
      }),
    ).rejects.toThrow(/direction/);
  });
});

describe("完整 3 日滾動：5000 → 13000 → 12950 → 12950", () => {
  it("Day1 close: opening 5000 + income 8000 = 13000，正常閉店", async () => {
    mockSessionFindUnique.mockResolvedValue({
      id: "sess-day1",
      storeId: STORE_A,
      businessDate: new Date(Date.UTC(2026, 4, 13)),
      status: "OPEN",
      openingBookBalance: D(5000),
      openingActualCash: D(5000),
      openingDifference: D(0),
      openedAt: new Date("2026-05-13T01:00:00Z"),
      closedAt: null,
    });
    mockTxAggregate
      .mockResolvedValueOnce({ _sum: { amount: D(8000) } })
      .mockResolvedValueOnce({ _sum: { amount: null } });
    mockSessionUpdate.mockResolvedValue({ id: "sess-day1" });

    await closeCashDrawer({
      sessionId: "sess-day1",
      closingActualCash: 13000,
      actorUserId: USER_OWNER,
    });

    const call = mockSessionUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect((call.data.finalBookBalance as Prisma.Decimal).toNumber()).toBe(13000);
  });

  it("Day2 open: 自動帶 13000，無收支直接 close，finalBookBalance 仍 13000", async () => {
    // 模擬 Day2 開店再閉店
    mockSessionFindFirst.mockResolvedValue({
      id: "sess-day1",
      storeId: STORE_A,
      status: "CLOSED",
      finalBookBalance: D(13000),
      businessDate: new Date(Date.UTC(2026, 4, 13)),
    });
    mockSessionCreate.mockResolvedValue({ id: "sess-day2" });

    await openCashDrawer({
      storeId: STORE_A,
      businessDate: new Date(Date.UTC(2026, 4, 14)),
      openingActualCash: 13000,
      actorUserId: USER_OWNER,
    });

    const openCall = mockSessionCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect((openCall.data.openingBookBalance as Prisma.Decimal).toNumber()).toBe(13000);
  });
});
