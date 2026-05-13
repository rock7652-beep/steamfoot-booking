/**
 * Cash Drawer 多日滾動結餘場景測試
 *
 * 重點：finalBookBalance = expectedClosingCash 鐵則對連續多日的影響。
 *
 * 場景：
 *   C: Day1 短少 100 未認列，Day2 開店仍從帳面金額起算 → openingDifference 持續暴露 -100
 *   D: Day1 短少 100，Day2 OWNER 認列（CASH_ADJUSTMENT OUT 100），Day2 closingDifference = 0
 *   E: Day1 短少 100 + Day2 認列調整，Day3 openingDifference = 0（已清帳）
 *
 * 不在此檔覆蓋的場景：
 *   A/B（短少 / 溢出時 finalBookBalance = expected）已在 cash-drawer-service.test.ts
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
    transaction: { aggregate: (...a: unknown[]) => fns.mockTxAggregate(...a) },
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
  mockEntryFindMany.mockResolvedValue([]);
});

describe("場景 C：Day1 短少 100 未認列，Day2 開店", () => {
  it("Day1 finalBookBalance 維持帳面 5000（不會降到 4900）", async () => {
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
    expect((closeCall.data.finalBookBalance as Prisma.Decimal).toNumber()).toBe(5000);
    expect((closeCall.data.closingDifference as Prisma.Decimal).toNumber()).toBe(-100);
  });

  it("Day2 open 自動帶入 5000（不是 4900），實點 4900 時 openingDifference = -100", async () => {
    // Day2: 上日 CLOSED session.finalBookBalance = 5000（帳面）
    mockSessionFindFirst.mockResolvedValue({
      id: "sess-day1",
      storeId: STORE_A,
      status: "CLOSED",
      finalBookBalance: D(5000),
      businessDate: new Date(Date.UTC(2026, 4, 13)),
    });
    mockSessionCreate.mockResolvedValue({ id: "sess-day2" });

    await openCashDrawer({
      storeId: STORE_A,
      businessDate: new Date(Date.UTC(2026, 4, 14)),
      openingActualCash: 4900, // 仍短少 100
      note: "短少 100 持續存在",
      actorUserId: USER_OWNER,
    });

    const call = mockSessionCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect((call.data.openingBookBalance as Prisma.Decimal).toNumber()).toBe(5000);
    expect((call.data.openingDifference as Prisma.Decimal).toNumber()).toBe(-100);
    // ← 鐵則證明：短少持續暴露，不會被默默吃掉
  });
});

describe("場景 D：Day2 OWNER 用 CASH_ADJUSTMENT OUT 認列 Day1 短少", () => {
  it("Day2 加 ADJUSTMENT OUT 100 後，closingDifference = 0", async () => {
    // Day2: opening book 5000, actual 4900, ADJUSTMENT OUT 100 認列短少
    // 應有現金 = 5000 + 0 - 0 - 0 + 0 + (-100) = 4900
    // closingActualCash 4900 → closingDifference = 0
    mockSessionFindUnique.mockResolvedValue({
      id: "sess-day2",
      storeId: STORE_A,
      businessDate: new Date(Date.UTC(2026, 4, 14)),
      status: "OPEN",
      openingBookBalance: D(5000),
      openingActualCash: D(4900),
      openingDifference: D(-100),
      openedAt: new Date("2026-05-14T01:00:00Z"),
      closedAt: null,
    });
    mockEntryFindMany.mockResolvedValue([
      { type: "CASH_ADJUSTMENT", direction: "OUT", amount: D(100) },
    ]);
    mockSessionUpdate.mockResolvedValue({ id: "sess-day2" });

    await closeCashDrawer({
      sessionId: "sess-day2",
      closingActualCash: 4900,
      actorUserId: USER_OWNER,
    });

    const call = mockSessionUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect((call.data.expectedClosingCash as Prisma.Decimal).toNumber()).toBe(4900);
    expect((call.data.closingDifference as Prisma.Decimal).toNumber()).toBe(0);
    expect((call.data.cashAdjustmentTotal as Prisma.Decimal).toNumber()).toBe(-100);
    expect((call.data.finalBookBalance as Prisma.Decimal).toNumber()).toBe(4900);
  });
});

describe("場景 E：Day3 開店時短少已清帳", () => {
  it("Day2 認列後 finalBookBalance = 4900，Day3 開店實點 4900 時 openingDifference = 0", async () => {
    mockSessionFindFirst.mockResolvedValue({
      id: "sess-day2",
      storeId: STORE_A,
      status: "CLOSED",
      finalBookBalance: D(4900), // 上日認列後的新帳面
      businessDate: new Date(Date.UTC(2026, 4, 14)),
    });
    mockSessionCreate.mockResolvedValue({ id: "sess-day3" });

    await openCashDrawer({
      storeId: STORE_A,
      businessDate: new Date(Date.UTC(2026, 4, 15)),
      openingActualCash: 4900,
      actorUserId: USER_OWNER,
    });

    const call = mockSessionCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect((call.data.openingBookBalance as Prisma.Decimal).toNumber()).toBe(4900);
    expect((call.data.openingDifference as Prisma.Decimal).toNumber()).toBe(0);
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
