/**
 * Cash Drawer service 單元測試（mock prisma）
 *
 * 涵蓋：
 *   - initializeCashDrawer / openCashDrawer / addCashDrawerEntry / closeCashDrawer
 *   - computeCashIncomeForSession / computeCashExpenseForSession / computeManualEntryTotals
 *   - 非干擾驗證：操作不會觸發 Transaction / CashbookEntry 的寫入
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const STORE_A = "store-zhubei";
const STORE_B = "store-hsinchu";
const USER_OWNER = "user-owner-1";

// ── DB mocks（用 vi.hoisted 確保 vi.mock 工廠執行時可存取）──
const {
  mockSessionFindFirst,
  mockSessionFindUnique,
  mockSessionCreate,
  mockSessionUpdate,
  mockEntryFindMany,
  mockEntryCreate,
  mockTxAggregate,
  mockPaymentSplitAggregate,
  mockTransactionCreate,
  mockTransactionUpdate,
  mockCashbookCreate,
  mockCashbookUpdate,
  mockCashbookGroupBy,
  mockAuditLogCreate,
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
    mockTransactionCreate: vi.fn(),
    mockTransactionUpdate: vi.fn(),
    mockCashbookCreate: vi.fn(),
    mockCashbookUpdate: vi.fn(),
    mockCashbookGroupBy: vi.fn(),
    mockAuditLogCreate: vi.fn(),
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
    transaction: {
      aggregate: (...a: unknown[]) => fns.mockTxAggregate(...a),
      create: (...a: unknown[]) => fns.mockTransactionCreate(...a),
      update: (...a: unknown[]) => fns.mockTransactionUpdate(...a),
    },
    transactionPaymentSplit: {
      aggregate: (...a: unknown[]) => fns.mockPaymentSplitAggregate(...a),
    },
    cashbookEntry: {
      create: (...a: unknown[]) => fns.mockCashbookCreate(...a),
      update: (...a: unknown[]) => fns.mockCashbookUpdate(...a),
      groupBy: (...a: unknown[]) => fns.mockCashbookGroupBy(...a),
    },
    auditLog: {
      create: (...a: unknown[]) => fns.mockAuditLogCreate(...a),
    },
  };
  db.$transaction = (cb: (tx: unknown) => Promise<unknown>) => cb(db);
  return { ...fns, dbMock: db };
});

vi.mock("@/lib/db", () => ({ prisma: dbMock }));

import {
  initializeCashDrawer,
  openCashDrawer,
  addCashDrawerEntry,
  closeCashDrawer,
  reopenCashDrawer,
  computeCashIncomeForSession,
  computeTransactionNonCashIncomeForSession,
  computeCashbookIncomeOverviewForSession,
  computePaymentOverviewForSession,
  computeCashExpenseForSession,
  computeManualEntryTotals,
  computeCashbookCashMovementsForSession,
  getCurrentCashDrawer,
} from "@/server/services/cash-drawer";
import { dayRange } from "@/lib/date-utils";

const D = (n: number) => new Prisma.Decimal(n);

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "sess-1",
    storeId: STORE_A,
    businessDate: new Date(Date.UTC(2026, 4, 13)),
    status: "OPEN",
    openingBookBalance: D(5000),
    openingActualCash: D(5000),
    openingDifference: D(0),
    openedAt: new Date("2026-05-13T01:00:00.000Z"),
    closedAt: null,
    finalBookBalance: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Defaults — aggregate returns null（無資料）
  mockTxAggregate.mockResolvedValue({ _sum: { amount: null } });
  mockPaymentSplitAggregate.mockResolvedValue({ _sum: { amount: null } });
  mockEntryFindMany.mockResolvedValue([]);
  mockAuditLogCreate.mockResolvedValue({ id: "audit-1" });
  // PR-3：預設無現金帳異動，個別測試可覆寫
  mockCashbookGroupBy.mockResolvedValue([]);
});

// ============================================================
// initializeCashDrawer
// ============================================================

describe("initializeCashDrawer", () => {
  it("店無任何 session 時建立首筆 OPEN session", async () => {
    mockSessionFindFirst.mockResolvedValue(null);
    mockSessionCreate.mockResolvedValue({ ...makeSession(), id: "sess-init" });

    await initializeCashDrawer({
      storeId: STORE_A,
      businessDate: new Date(Date.UTC(2026, 4, 13)),
      openingBookBalance: 5050,
      openingActualCash: 5050,
      actorUserId: USER_OWNER,
    });

    expect(mockSessionCreate).toHaveBeenCalledOnce();
    const call = mockSessionCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.status).toBe("OPEN");
    expect((call.data.openingBookBalance as Prisma.Decimal).toNumber()).toBe(5050);
    expect((call.data.openingActualCash as Prisma.Decimal).toNumber()).toBe(5050);
    expect((call.data.openingDifference as Prisma.Decimal).toNumber()).toBe(0);
  });

  it("店已有 session 時拒絕（CONFLICT）", async () => {
    mockSessionFindFirst.mockResolvedValue(makeSession());
    await expect(
      initializeCashDrawer({
        storeId: STORE_A,
        businessDate: new Date(Date.UTC(2026, 4, 13)),
        openingBookBalance: 5000,
        openingActualCash: 5000,
        actorUserId: USER_OWNER,
      }),
    ).rejects.toThrow(/已有現金抽屜/);
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });

  it("差額非 0 沒填 note 時拒絕（VALIDATION）", async () => {
    mockSessionFindFirst.mockResolvedValue(null);
    await expect(
      initializeCashDrawer({
        storeId: STORE_A,
        businessDate: new Date(Date.UTC(2026, 4, 13)),
        openingBookBalance: 5050,
        openingActualCash: 5000,
        actorUserId: USER_OWNER,
      }),
    ).rejects.toThrow(/必須填寫備註/);
  });
});

// ============================================================
// openCashDrawer
// ============================================================

describe("openCashDrawer", () => {
  it("帶入上日 finalBookBalance 作為 openingBookBalance", async () => {
    mockSessionFindFirst.mockResolvedValue(
      makeSession({ status: "CLOSED", finalBookBalance: D(8100) }),
    );
    mockSessionCreate.mockResolvedValue({ ...makeSession(), id: "sess-day2" });

    await openCashDrawer({
      storeId: STORE_A,
      businessDate: new Date(Date.UTC(2026, 4, 14)),
      openingActualCash: 8100,
      actorUserId: USER_OWNER,
    });

    const call = mockSessionCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect((call.data.openingBookBalance as Prisma.Decimal).toNumber()).toBe(8100);
    expect((call.data.openingDifference as Prisma.Decimal).toNumber()).toBe(0);
  });

  it("找不到上日 CLOSED session 時拒絕", async () => {
    mockSessionFindFirst.mockResolvedValue(null);
    await expect(
      openCashDrawer({
        storeId: STORE_A,
        businessDate: new Date(Date.UTC(2026, 4, 14)),
        openingActualCash: 5000,
        actorUserId: USER_OWNER,
      }),
    ).rejects.toThrow(/上一個已閉店/);
  });

  it("差額非 0 沒填 note 時拒絕", async () => {
    mockSessionFindFirst.mockResolvedValue(
      makeSession({ status: "CLOSED", finalBookBalance: D(8100) }),
    );
    await expect(
      openCashDrawer({
        storeId: STORE_A,
        businessDate: new Date(Date.UTC(2026, 4, 14)),
        openingActualCash: 8000,
        actorUserId: USER_OWNER,
      }),
    ).rejects.toThrow(/必須填寫備註/);
  });

  it("差額非 0 有填 note 時通過，openingDifference 正確記錄", async () => {
    mockSessionFindFirst.mockResolvedValue(
      makeSession({ status: "CLOSED", finalBookBalance: D(8100) }),
    );
    mockSessionCreate.mockResolvedValue({ ...makeSession(), id: "sess-day2" });

    await openCashDrawer({
      storeId: STORE_A,
      businessDate: new Date(Date.UTC(2026, 4, 14)),
      openingActualCash: 8000,
      note: "盤點短少 100，待查",
      actorUserId: USER_OWNER,
    });

    const call = mockSessionCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect((call.data.openingDifference as Prisma.Decimal).toNumber()).toBe(-100);
    expect(call.data.openingNote).toBe("盤點短少 100，待查");
  });
});

// ============================================================
// addCashDrawerEntry
// ============================================================

describe("addCashDrawerEntry", () => {
  it("session 不存在拋 NOT_FOUND", async () => {
    mockSessionFindUnique.mockResolvedValue(null);
    await expect(
      addCashDrawerEntry({
        sessionId: "missing",
        type: "CASH_WITHDRAWAL",
        amount: 100,
        reason: "test",
        actorUserId: USER_OWNER,
      }),
    ).rejects.toThrow(/找不到/);
  });

  it("CLOSED session 拒絕", async () => {
    mockSessionFindUnique.mockResolvedValue(makeSession({ status: "CLOSED" }));
    await expect(
      addCashDrawerEntry({
        sessionId: "sess-1",
        type: "CASH_WITHDRAWAL",
        amount: 100,
        reason: "test",
        actorUserId: USER_OWNER,
      }),
    ).rejects.toThrow(/閉店鎖定/);
  });

  it("amount <= 0 拒絕", async () => {
    mockSessionFindUnique.mockResolvedValue(makeSession());
    await expect(
      addCashDrawerEntry({
        sessionId: "sess-1",
        type: "CASH_WITHDRAWAL",
        amount: 0,
        reason: "test",
        actorUserId: USER_OWNER,
      }),
    ).rejects.toThrow(/必須大於 0/);
  });

  it("reason 空白拒絕", async () => {
    mockSessionFindUnique.mockResolvedValue(makeSession());
    await expect(
      addCashDrawerEntry({
        sessionId: "sess-1",
        type: "CASH_WITHDRAWAL",
        amount: 100,
        reason: "   ",
        actorUserId: USER_OWNER,
      }),
    ).rejects.toThrow(/原因必填/);
  });

  it("CASH_WITHDRAWAL 自動 OUT", async () => {
    mockSessionFindUnique.mockResolvedValue(makeSession());
    mockEntryCreate.mockResolvedValue({ id: "entry-1" });
    await addCashDrawerEntry({
      sessionId: "sess-1",
      type: "CASH_WITHDRAWAL",
      amount: 5000,
      reason: "老闆領現",
      actorUserId: USER_OWNER,
    });
    const call = mockEntryCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.direction).toBe("OUT");
    expect((call.data.amount as Prisma.Decimal).toNumber()).toBe(5000);
  });

  it("CASH_DEPOSIT 自動 IN", async () => {
    mockSessionFindUnique.mockResolvedValue(makeSession());
    mockEntryCreate.mockResolvedValue({ id: "entry-1" });
    await addCashDrawerEntry({
      sessionId: "sess-1",
      type: "CASH_DEPOSIT",
      amount: 2000,
      reason: "補找零金",
      actorUserId: USER_OWNER,
    });
    const call = mockEntryCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.direction).toBe("IN");
  });
});

// ============================================================
// closeCashDrawer
// ============================================================

describe("closeCashDrawer", () => {
  it("正確計算 expectedClosingCash 並寫入快照", async () => {
    mockSessionFindUnique.mockResolvedValue(
      makeSession({ openingBookBalance: D(5000), openingActualCash: D(5000) }),
    );
    mockTxAggregate
      .mockResolvedValueOnce({ _sum: { amount: D(8000) } }) // income
      .mockResolvedValueOnce({ _sum: { amount: D(0) } }); // expense
    mockEntryFindMany.mockResolvedValue([
      { type: "CASH_WITHDRAWAL", direction: "OUT", amount: D(2000) },
    ]);
    mockSessionUpdate.mockResolvedValue({ id: "sess-1" });

    await closeCashDrawer({
      sessionId: "sess-1",
      closingActualCash: 11000, // 5000 + 8000 - 2000 = 11000
      actorUserId: USER_OWNER,
    });

    const call = mockSessionUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect((call.data.expectedClosingCash as Prisma.Decimal).toNumber()).toBe(11000);
    expect((call.data.closingDifference as Prisma.Decimal).toNumber()).toBe(0);
    expect(call.data.status).toBe("CLOSED");
  });

  it("已 CLOSED 拒絕重複關閉", async () => {
    mockSessionFindUnique.mockResolvedValue(makeSession({ status: "CLOSED" }));
    await expect(
      closeCashDrawer({
        sessionId: "sess-1",
        closingActualCash: 5000,
        actorUserId: USER_OWNER,
      }),
    ).rejects.toThrow(/已閉店/);
  });

  it("差額非 0 沒填 note 拒絕", async () => {
    mockSessionFindUnique.mockResolvedValue(
      makeSession({ openingBookBalance: D(5000), openingActualCash: D(5000) }),
    );
    await expect(
      closeCashDrawer({
        sessionId: "sess-1",
        closingActualCash: 4900,
        actorUserId: USER_OWNER,
      }),
    ).rejects.toThrow(/必須填寫備註/);
  });

  it("(PR-5) 短少時 finalBookBalance = closingActualCash（差額留在當天，下次開店從實點開始）", async () => {
    // PR-5：差額記在當天 closingDifference，下次開店起點用實際點到的現金
    mockSessionFindUnique.mockResolvedValue(
      makeSession({ openingBookBalance: D(5000), openingActualCash: D(5000) }),
    );
    mockSessionUpdate.mockResolvedValue({ id: "sess-1" });

    await closeCashDrawer({
      sessionId: "sess-1",
      closingActualCash: 4900, // 短少 100
      note: "盤點短少 100",
      actorUserId: USER_OWNER,
    });

    const call = mockSessionUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect((call.data.expectedClosingCash as Prisma.Decimal).toNumber()).toBe(5000);
    expect((call.data.closingActualCash as Prisma.Decimal).toNumber()).toBe(4900);
    // 差額仍完整保留在當天
    expect((call.data.closingDifference as Prisma.Decimal).toNumber()).toBe(-100);
    // 關鍵（PR-5）：finalBookBalance 用實點而非 expected → 下次開店從 4900 開始
    expect((call.data.finalBookBalance as Prisma.Decimal).toNumber()).toBe(4900);
  });

  it("(PR-5) 溢出時 finalBookBalance = closingActualCash（差額留在當天，下次開店從實點開始）", async () => {
    mockSessionFindUnique.mockResolvedValue(
      makeSession({ openingBookBalance: D(5000), openingActualCash: D(5000) }),
    );
    mockSessionUpdate.mockResolvedValue({ id: "sess-1" });

    await closeCashDrawer({
      sessionId: "sess-1",
      closingActualCash: 5050, // 溢出 50
      note: "盤點溢出 50",
      actorUserId: USER_OWNER,
    });

    const call = mockSessionUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect((call.data.closingDifference as Prisma.Decimal).toNumber()).toBe(50);
    // 關鍵（PR-5）：finalBookBalance 用實點 5050 而非 expected 5000
    expect((call.data.finalBookBalance as Prisma.Decimal).toNumber()).toBe(5050);
  });

  it("(PR-5) 大額短少：expected 7765、實點 2295 → finalBookBalance=2295、差額 -5470 保留", async () => {
    // 用戶情境：系統應有 7765，實際點到 2295。差額留在當天，下次開店從 2295 開始。
    mockSessionFindUnique.mockResolvedValue(
      makeSession({ openingBookBalance: D(7765), openingActualCash: D(7765) }),
    );
    mockSessionUpdate.mockResolvedValue({ id: "sess-1" });

    await closeCashDrawer({
      sessionId: "sess-1",
      closingActualCash: 2295,
      note: "現場點到 2295，差額待查",
      actorUserId: USER_OWNER,
    });

    const call = mockSessionUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect((call.data.expectedClosingCash as Prisma.Decimal).toNumber()).toBe(7765);
    expect((call.data.closingActualCash as Prisma.Decimal).toNumber()).toBe(2295);
    expect((call.data.closingDifference as Prisma.Decimal).toNumber()).toBe(-5470);
    // 不再用 7765（不會每天越差越多）
    expect((call.data.finalBookBalance as Prisma.Decimal).toNumber()).toBe(2295);
  });
});

// ============================================================
// reopenCashDrawer
// ============================================================

describe("reopenCashDrawer", () => {
  const closedSession = () =>
    makeSession({
      status: "CLOSED",
      cashIncomeTotal: D(8000),
      cashExpenseTotal: D(0),
      cashWithdrawalTotal: D(2000),
      cashDepositTotal: D(0),
      cashAdjustmentTotal: D(0),
      expectedClosingCash: D(11000),
      closingActualCash: D(11000),
      closingDifference: D(0),
      closingNote: null,
      closedByUserId: USER_OWNER,
      closedAt: new Date("2026-05-13T13:00:00.000Z"),
      finalBookBalance: D(11000),
    });

  it("後續尚未開店時恢復 OPEN、清除閉店快照並留下 audit", async () => {
    mockSessionFindUnique.mockResolvedValue(closedSession());
    mockSessionFindFirst.mockResolvedValue(null);
    mockSessionUpdate.mockResolvedValue(makeSession());

    await reopenCashDrawer({
      sessionId: "sess-1",
      reason: "閉店實點金額輸入錯誤",
      actorUserId: USER_OWNER,
    });

    const update = mockSessionUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(update.data.status).toBe("OPEN");
    expect(update.data.closingActualCash).toBeNull();
    expect(update.data.finalBookBalance).toBeNull();

    const audit = mockAuditLogCreate.mock.calls[0][0] as {
      data: { action: string; beforeJson: Record<string, unknown>; afterJson: Record<string, unknown> };
    };
    expect(audit.data.action).toBe("REOPEN");
    expect(audit.data.beforeJson.closingActualCash).toBe("11000");
    expect(audit.data.afterJson.reason).toBe("閉店實點金額輸入錯誤");
  });

  it("同店已有後續營業日時拒絕，避免破壞滾動結餘", async () => {
    mockSessionFindUnique.mockResolvedValue(closedSession());
    mockSessionFindFirst.mockResolvedValue({ id: "later-session" });

    await expect(
      reopenCashDrawer({
        sessionId: "sess-1",
        reason: "金額錯誤",
        actorUserId: USER_OWNER,
      }),
    ).rejects.toThrow(/後續營業日已經開店/);
    expect(mockSessionUpdate).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it("空白原因拒絕", async () => {
    await expect(
      reopenCashDrawer({ sessionId: "sess-1", reason: "   ", actorUserId: USER_OWNER }),
    ).rejects.toThrow(/撤銷閉店原因/);
  });
});

// ============================================================
// Computation helpers
// ============================================================

describe("computeCashIncomeForSession", () => {
  it("加總並回傳 CASH 收入", async () => {
    mockTxAggregate.mockResolvedValue({ _sum: { amount: D(8000) } });
    const result = await computeCashIncomeForSession({
      storeId: STORE_A,
      businessDate: new Date(Date.UTC(2026, 4, 13)),
    });
    expect(result.toNumber()).toBe(8000);
  });

  it("新交易以 CASH 拆分額、歷史交易以 paymentMethod=CASH 加總", async () => {
    mockTxAggregate.mockResolvedValue({ _sum: { amount: null } });
    await computeCashIncomeForSession({
      storeId: STORE_A,
      businessDate: new Date(Date.UTC(2026, 4, 13)),
    });
    const call = mockTxAggregate.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(call.where.paymentMethod).toEqual({ in: ["CASH"] });
    expect(call.where.paymentSplits).toEqual({ none: {} });
    expect(call.where.status).toBe("SUCCESS");
    expect(call.where.voidedAt).toBe(null);
    expect(call.where.storeId).toBe(STORE_A);
  });

  it("混合付款只把現金拆分額計入抽屜，歷史單一付款維持原額", async () => {
    mockPaymentSplitAggregate.mockResolvedValue({ _sum: { amount: D(2000) } });
    mockTxAggregate.mockResolvedValue({ _sum: { amount: D(800) } });

    const result = await computeCashIncomeForSession({
      storeId: STORE_A,
      businessDate: new Date(Date.UTC(2026, 4, 13)),
    });

    expect(result.toNumber()).toBe(2800);
    const splitCall = mockPaymentSplitAggregate.mock.calls[0][0] as { where: { paymentMethod: { in: string[] } } };
    expect(splitCall.where.paymentMethod.in).toEqual(["CASH"]);
  });

  it("transactionType filter 含 REVENUE_TYPES，不含 REFUND / SESSION_DEDUCTION / MANUAL_USED_BACKFILL / PAPER_MIGRATION / ADJUSTMENT", async () => {
    mockTxAggregate.mockResolvedValue({ _sum: { amount: null } });
    await computeCashIncomeForSession({
      storeId: STORE_A,
      businessDate: new Date(Date.UTC(2026, 4, 13)),
    });
    const call = mockTxAggregate.mock.calls[0][0] as {
      where: { transactionType: { in: string[] } };
    };
    const types = call.where.transactionType.in;
    expect(types).toContain("TRIAL_PURCHASE");
    expect(types).toContain("SINGLE_PURCHASE");
    expect(types).toContain("PACKAGE_PURCHASE");
    expect(types).toContain("SUPPLEMENT");
    expect(types).not.toContain("REFUND");
    expect(types).not.toContain("SESSION_DEDUCTION");
    expect(types).not.toContain("MANUAL_USED_BACKFILL");
    expect(types).not.toContain("PAPER_MIGRATION");
    expect(types).not.toContain("ADJUSTMENT");
  });

  // ──────────────────────────────────────────────────────────
  // P0 fix（fix/cash-drawer-businessday-window）：
  // 時間窗改用 session.businessDate 的台灣營業日 day-range，不再用 openedAt..now。
  // 用「傍晚才開店」(openedAt = TW 20:53) 的 session 驗證白天現金不再被漏算。
  // ──────────────────────────────────────────────────────────
  describe("營業日時間窗（不依 openedAt）", () => {
    // 2026-06-09 傍晚才開店：openedAt = TW 20:53 = UTC 12:53
    const businessDate = new Date(Date.UTC(2026, 5, 9));
    const eveningOpenedAt = new Date("2026-06-09T12:53:00Z");
    const { start: dayStart, end: dayEnd } = dayRange("2026-06-09");

    async function captureWhere() {
      mockTxAggregate.mockResolvedValue({ _sum: { amount: null } });
      await computeCashIncomeForSession({
        storeId: STORE_A,
        // 故意連 openedAt/closedAt 都傳進來，證明計算「不」採用它們
        businessDate,
        openedAt: eveningOpenedAt,
        closedAt: null,
      } as never);
      const call = mockTxAggregate.mock.calls[0][0] as {
        where: { transactionDate: { gte: Date; lte: Date } };
      };
      return call.where.transactionDate;
    }

    it("時間窗 = 台灣營業日 [00:00, 23:59:59.999]，而非 openedAt", async () => {
      const win = await captureWhere();
      expect(win.gte.getTime()).toBe(dayStart.getTime());
      expect(win.lte.getTime()).toBe(dayEnd.getTime());
      // 視窗起點在傍晚開店之前 → 白天交易落在窗內
      expect(win.gte.getTime()).toBeLessThan(eveningOpenedAt.getTime());
    });

    it("case 1：開店點錢之前、但同營業日的現金交易 → 落在窗內（會被算進）", async () => {
      const win = await captureWhere();
      // TW 14:00（= UTC 06:00），在 openedAt(TW 20:53) 之前
      const beforeOpen = new Date("2026-06-09T06:00:00Z");
      expect(beforeOpen.getTime()).toBeLessThan(eveningOpenedAt.getTime());
      expect(beforeOpen.getTime()).toBeGreaterThanOrEqual(win.gte.getTime());
      expect(beforeOpen.getTime()).toBeLessThanOrEqual(win.lte.getTime());
    });

    it("case 2：開店點錢之後、同營業日的現金交易 → 落在窗內（會被算進）", async () => {
      const win = await captureWhere();
      // TW 21:30（= UTC 13:30），在 openedAt 之後、仍在當日
      const afterOpen = new Date("2026-06-09T13:30:00Z");
      expect(afterOpen.getTime()).toBeGreaterThan(eveningOpenedAt.getTime());
      expect(afterOpen.getTime()).toBeGreaterThanOrEqual(win.gte.getTime());
      expect(afterOpen.getTime()).toBeLessThanOrEqual(win.lte.getTime());
    });

    it("case 3：營業日之外的現金交易 → 落在窗外（會被排除）", async () => {
      const win = await captureWhere();
      // 前一日 TW 23:00（= UTC 6/8 15:00）→ 早於窗起點
      const prevDay = new Date("2026-06-08T15:00:00Z");
      expect(prevDay.getTime()).toBeLessThan(win.gte.getTime());
      // 隔日 TW 01:00（= UTC 6/9 17:00）→ 晚於窗終點
      const nextDay = new Date("2026-06-09T17:00:00Z");
      expect(nextDay.getTime()).toBeGreaterThan(win.lte.getTime());
    });

    it("case 4：非現金交易 → 由 paymentMethod=CASH 過濾排除", async () => {
      mockTxAggregate.mockResolvedValue({ _sum: { amount: null } });
      await computeCashIncomeForSession({ storeId: STORE_A, businessDate });
      const call = mockTxAggregate.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(call.where.paymentMethod).toEqual({ in: ["CASH"] });
    });

    it("case 5：作廢交易 → 由 voidedAt=null 過濾排除", async () => {
      mockTxAggregate.mockResolvedValue({ _sum: { amount: null } });
      await computeCashIncomeForSession({ storeId: STORE_A, businessDate });
      const call = mockTxAggregate.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(call.where.voidedAt).toBe(null);
    });
  });
});

describe("computeCashExpenseForSession", () => {
  it("REFUND 負數 amount 翻成正數量級", async () => {
    // REFUND.amount 為負數（refund v2 約定）
    mockTxAggregate.mockResolvedValue({ _sum: { amount: D(-1000) } });
    const result = await computeCashExpenseForSession({
      storeId: STORE_A,
      businessDate: new Date(Date.UTC(2026, 4, 13)),
    });
    expect(result.toNumber()).toBe(1000); // 翻成正數
  });

  it("transactionType 只 query REFUND", async () => {
    mockTxAggregate.mockResolvedValue({ _sum: { amount: null } });
    await computeCashExpenseForSession({
      storeId: STORE_A,
      businessDate: new Date(Date.UTC(2026, 4, 13)),
    });
    const call = mockTxAggregate.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(call.where.transactionType).toBe("REFUND");
    expect(call.where.paymentMethod).toBe("CASH");
  });

  it("case 6：退款（現金支出）使用與收入相同的營業日時間窗", async () => {
    mockTxAggregate.mockResolvedValue({ _sum: { amount: null } });
    const { start: dayStart, end: dayEnd } = dayRange("2026-06-09");
    await computeCashExpenseForSession({
      storeId: STORE_A,
      businessDate: new Date(Date.UTC(2026, 5, 9)),
      openedAt: new Date("2026-06-09T12:53:00Z"),
      closedAt: null,
    } as never);
    const call = mockTxAggregate.mock.calls[0][0] as {
      where: { transactionDate: { gte: Date; lte: Date } };
    };
    expect(call.where.transactionDate.gte.getTime()).toBe(dayStart.getTime());
    expect(call.where.transactionDate.lte.getTime()).toBe(dayEnd.getTime());
  });
});

describe("computeTransactionNonCashIncomeForSession / computePaymentOverviewForSession", () => {
  it("加總並回傳 Transaction 非現金收入", async () => {
    mockTxAggregate.mockResolvedValue({ _sum: { amount: D(1500) } });
    const result = await computeTransactionNonCashIncomeForSession({
      storeId: STORE_A,
      businessDate: new Date(Date.UTC(2026, 4, 13)),
    });
    expect(result.toNumber()).toBe(1500);
  });

  it("非現金收入條件：排除 CASH / UNPAID，只納入已成功或已確認收款", async () => {
    mockTxAggregate.mockResolvedValue({ _sum: { amount: null } });
    await computeTransactionNonCashIncomeForSession({
      storeId: STORE_A,
      businessDate: new Date(Date.UTC(2026, 4, 13)),
    });
    const call = mockTxAggregate.mock.calls[0][0] as {
      where: {
        paymentMethod: { in: string[] };
        transactionType: { in: string[] };
        paymentStatus: { in: string[] };
        status: string;
        voidedAt: null;
      };
    };
    expect(call.where.paymentMethod.in).toEqual([
      "TRANSFER",
      "LINE_PAY",
      "CREDIT_CARD",
      "OTHER",
    ]);
    expect(call.where.paymentMethod.in).not.toContain("CASH");
    expect(call.where.paymentMethod.in).not.toContain("UNPAID");
    expect(call.where.paymentStatus.in).toEqual(["SUCCESS", "CONFIRMED"]);
    expect(call.where.status).toBe("SUCCESS");
    expect(call.where.voidedAt).toBe(null);
    expect(call.where.transactionType.in).toContain("TRIAL_PURCHASE");
    expect(call.where.transactionType.in).toContain("SINGLE_PURCHASE");
    expect(call.where.transactionType.in).toContain("PACKAGE_PURCHASE");
    expect(call.where.transactionType.in).toContain("SUPPLEMENT");
    expect(call.where.transactionType.in).not.toContain("REFUND");
    expect(call.where.transactionType.in).not.toContain("SESSION_DEDUCTION");
    expect(call.where.transactionType.in).not.toContain("MANUAL_USED_BACKFILL");
    expect(call.where.transactionType.in).not.toContain("PAPER_MIGRATION");
    expect(call.where.transactionType.in).not.toContain("ADJUSTMENT");
  });

  it("混合付款的非現金收入只計入非現金拆分額", async () => {
    mockPaymentSplitAggregate.mockResolvedValue({ _sum: { amount: D(3000) } });
    mockTxAggregate.mockResolvedValue({ _sum: { amount: D(1500) } });

    const result = await computeTransactionNonCashIncomeForSession({
      storeId: STORE_A,
      businessDate: new Date(Date.UTC(2026, 4, 13)),
    });

    expect(result.toNumber()).toBe(4500);
  });

  it("Cashbook INCOME 依 CASH / OTHER 分組，且排除支出、提領、調整", async () => {
    mockCashbookGroupBy.mockResolvedValue([
      { paymentMethod: "CASH", _sum: { amount: D(100) } },
      { paymentMethod: "OTHER", _sum: { amount: D(101) } },
    ]);

    const result = await computeCashbookIncomeOverviewForSession({
      storeId: STORE_A,
      businessDate: new Date(Date.UTC(2026, 4, 13)),
    });

    expect(result.cashbookCashIncome.toNumber()).toBe(100);
    expect(result.cashbookOtherIncome.toNumber()).toBe(101);
    const call = mockCashbookGroupBy.mock.calls[0][0] as {
      by: string[];
      where: {
        storeId: string;
        type: string;
        paymentMethod: { in: string[] };
        entryDate: { gte: Date; lt: Date };
      };
    };
    expect(call.by).toEqual(["paymentMethod"]);
    expect(call.where.storeId).toBe(STORE_A);
    expect(call.where.type).toBe("INCOME");
    expect(call.where.paymentMethod.in).toEqual(["CASH", "OTHER"]);
    expect(call.where.entryDate.gte).toEqual(new Date(Date.UTC(2026, 4, 13)));
    expect(call.where.entryDate.lt).toEqual(new Date(Date.UTC(2026, 4, 14)));
  });

  it("今日收款合計 = Transaction 收入 + Cashbook INCOME", async () => {
    mockTxAggregate
      .mockResolvedValueOnce({ _sum: { amount: D(798) } })
      .mockResolvedValueOnce({ _sum: { amount: D(1500) } });
    mockCashbookGroupBy.mockResolvedValue([
      { paymentMethod: "CASH", _sum: { amount: D(100) } },
      { paymentMethod: "OTHER", _sum: { amount: D(101) } },
    ]);

    const result = await computePaymentOverviewForSession({
      storeId: STORE_A,
      businessDate: new Date(Date.UTC(2026, 4, 13)),
    });

    expect(result.paymentOverviewCashIncomeTotal.toNumber()).toBe(898);
    expect(result.nonCashIncomeTotal.toNumber()).toBe(1601);
    expect(result.todayPaymentTotal.toNumber()).toBe(2499);
  });

  it("可重用已算好的 Transaction cashIncomeTotal，避免重查現金收入", async () => {
    mockTxAggregate.mockResolvedValueOnce({ _sum: { amount: D(1500) } });
    mockCashbookGroupBy.mockResolvedValue([
      { paymentMethod: "CASH", _sum: { amount: D(100) } },
      { paymentMethod: "OTHER", _sum: { amount: D(101) } },
    ]);

    const result = await computePaymentOverviewForSession(
      {
        storeId: STORE_A,
        businessDate: new Date(Date.UTC(2026, 4, 13)),
      },
      D(798),
    );

    expect(mockTxAggregate).toHaveBeenCalledTimes(1);
    expect(result.paymentOverviewCashIncomeTotal.toNumber()).toBe(898);
    expect(result.nonCashIncomeTotal.toNumber()).toBe(1601);
    expect(result.todayPaymentTotal.toNumber()).toBe(2499);
  });
});

describe("computeManualEntryTotals", () => {
  it("正確分組 WITHDRAWAL / DEPOSIT / ADJUSTMENT（含 ADJUSTMENT signed）", async () => {
    mockEntryFindMany.mockResolvedValue([
      { type: "CASH_WITHDRAWAL", direction: "OUT", amount: D(5000) },
      { type: "CASH_WITHDRAWAL", direction: "OUT", amount: D(3000) },
      { type: "CASH_DEPOSIT", direction: "IN", amount: D(2000) },
      { type: "CASH_ADJUSTMENT", direction: "IN", amount: D(50) },
      { type: "CASH_ADJUSTMENT", direction: "OUT", amount: D(100) },
    ]);
    const result = await computeManualEntryTotals("sess-1");
    expect(result.cashWithdrawalTotal.toNumber()).toBe(8000);
    expect(result.cashDepositTotal.toNumber()).toBe(2000);
    expect(result.cashAdjustmentTotal.toNumber()).toBe(50 - 100);
  });

  it("空 session 回傳 0", async () => {
    mockEntryFindMany.mockResolvedValue([]);
    const result = await computeManualEntryTotals("sess-1");
    expect(result.cashWithdrawalTotal.toNumber()).toBe(0);
    expect(result.cashDepositTotal.toNumber()).toBe(0);
    expect(result.cashAdjustmentTotal.toNumber()).toBe(0);
  });
});

// ============================================================
// PR-3：現金帳（CashbookEntry）對抽屜的影響
// ============================================================

describe("computeCashbookCashMovementsForSession", () => {
  it("INCOME 累進 income、EXPENSE + WITHDRAW 累進 out、ADJUSTMENT 忽略", async () => {
    mockCashbookGroupBy.mockResolvedValue([
      { type: "INCOME", _sum: { amount: D(1500) } },
      { type: "EXPENSE", _sum: { amount: D(400) } },
      { type: "WITHDRAW", _sum: { amount: D(600) } },
      { type: "ADJUSTMENT", _sum: { amount: D(9999) } },
    ]);
    const result = await computeCashbookCashMovementsForSession({
      storeId: STORE_A,
      businessDate: new Date(Date.UTC(2026, 4, 13)),
    });
    expect(result.cashbookCashIncome.toNumber()).toBe(1500);
    expect(result.cashbookCashOut.toNumber()).toBe(1000); // 400 + 600
  });

  it("只查 paymentMethod=CASH，entryDate 用 day-range [businessDate, +1d)", async () => {
    mockCashbookGroupBy.mockResolvedValue([]);
    await computeCashbookCashMovementsForSession({
      storeId: STORE_A,
      businessDate: new Date(Date.UTC(2026, 4, 13)),
    });
    const call = mockCashbookGroupBy.mock.calls[0][0] as {
      where: { storeId: string; paymentMethod: string; entryDate: { gte: Date; lt: Date } };
    };
    expect(call.where.storeId).toBe(STORE_A);
    expect(call.where.paymentMethod).toBe("CASH");
    expect(call.where.entryDate.gte).toEqual(new Date(Date.UTC(2026, 4, 13)));
    expect(call.where.entryDate.lt).toEqual(new Date(Date.UTC(2026, 4, 14)));
  });

  it("無現金帳資料時回 0/0", async () => {
    mockCashbookGroupBy.mockResolvedValue([]);
    const result = await computeCashbookCashMovementsForSession({
      storeId: STORE_A,
      businessDate: new Date(Date.UTC(2026, 4, 13)),
    });
    expect(result.cashbookCashIncome.equals(0)).toBe(true);
    expect(result.cashbookCashOut.equals(0)).toBe(true);
  });
});

describe("closeCashDrawer × 現金帳（PR-3）", () => {
  it("閉店快照的 expectedClosingCash 折進當日現金帳 CASH 收支", async () => {
    mockSessionFindUnique.mockResolvedValue(
      makeSession({ openingBookBalance: D(5000), openingActualCash: D(5000) }),
    );
    mockTxAggregate
      .mockResolvedValueOnce({ _sum: { amount: D(0) } }) // income
      .mockResolvedValueOnce({ _sum: { amount: D(0) } }); // expense
    mockEntryFindMany.mockResolvedValue([]);
    mockCashbookGroupBy.mockResolvedValue([
      { type: "INCOME", _sum: { amount: D(2000) } },
      { type: "EXPENSE", _sum: { amount: D(500) } },
    ]);
    mockSessionUpdate.mockResolvedValue({ id: "sess-1" });

    await closeCashDrawer({
      sessionId: "sess-1",
      closingActualCash: 6500, // 5000 + 2000 - 500
      actorUserId: USER_OWNER,
    });

    const call = mockSessionUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    // 5000 + cashbook(2000 - 500) = 6500
    expect((call.data.expectedClosingCash as Prisma.Decimal).toNumber()).toBe(6500);
    expect((call.data.closingDifference as Prisma.Decimal).toNumber()).toBe(0);
    // finalBookBalance = closingActualCash；本案例實點等於 expected
    expect((call.data.finalBookBalance as Prisma.Decimal).toNumber()).toBe(6500);
  });

  it("開店補入差額只影響抽屜實體應有現金，不算進今日現金收入", async () => {
    mockSessionFindUnique.mockResolvedValue(
      makeSession({
        openingBookBalance: D(1083),
        openingActualCash: D(1521),
        openingDifference: D(438),
      }),
    );
    mockTxAggregate
      .mockResolvedValueOnce({ _sum: { amount: D(798) } })
      .mockResolvedValueOnce({ _sum: { amount: D(0) } });
    mockEntryFindMany.mockResolvedValue([]);
    mockCashbookGroupBy.mockResolvedValue([
      { type: "EXPENSE", _sum: { amount: D(260) } },
    ]);
    mockSessionUpdate.mockResolvedValue({ id: "sess-1" });

    await closeCashDrawer({
      sessionId: "sess-1",
      closingActualCash: 2059,
      actorUserId: USER_OWNER,
    });

    const call = mockSessionUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect((call.data.cashIncomeTotal as Prisma.Decimal).toNumber()).toBe(798);
    expect((call.data.cashWithdrawalTotal as Prisma.Decimal).toNumber()).toBe(0);
    expect((call.data.expectedClosingCash as Prisma.Decimal).toNumber()).toBe(2059);
    expect((call.data.closingDifference as Prisma.Decimal).toNumber()).toBe(0);
  });

  it("開店短少差額會扣低關店系統應有現金，但不算進今日現金收入", async () => {
    mockSessionFindUnique.mockResolvedValue(
      makeSession({
        openingBookBalance: D(1521),
        openingActualCash: D(1083),
        openingDifference: D(-438),
      }),
    );
    mockTxAggregate
      .mockResolvedValueOnce({ _sum: { amount: D(798) } })
      .mockResolvedValueOnce({ _sum: { amount: D(0) } });
    mockEntryFindMany.mockResolvedValue([]);
    mockCashbookGroupBy.mockResolvedValue([
      { type: "EXPENSE", _sum: { amount: D(260) } },
    ]);
    mockSessionUpdate.mockResolvedValue({ id: "sess-1" });

    await closeCashDrawer({
      sessionId: "sess-1",
      closingActualCash: 1621,
      actorUserId: USER_OWNER,
    });

    const call = mockSessionUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect((call.data.cashIncomeTotal as Prisma.Decimal).toNumber()).toBe(798);
    expect((call.data.expectedClosingCash as Prisma.Decimal).toNumber()).toBe(1621);
    expect((call.data.closingDifference as Prisma.Decimal).toNumber()).toBe(0);
  });
});

describe("getCurrentCashDrawer × 現金帳（PR-3）", () => {
  it("OPEN：liveTotals 含現金帳收支並折進 expectedClosingCash", async () => {
    mockSessionFindUnique.mockResolvedValue(
      makeSession({ status: "OPEN", openingBookBalance: D(1000), openingActualCash: D(1000) }),
    );
    mockTxAggregate.mockResolvedValue({ _sum: { amount: D(0) } });
    mockEntryFindMany.mockResolvedValue([]);
    mockCashbookGroupBy.mockResolvedValue([{ type: "INCOME", _sum: { amount: D(800) } }]);

    const result = await getCurrentCashDrawer(STORE_A, new Date(Date.UTC(2026, 4, 13)));

    expect(result.liveTotals?.cashbookCashIncome.toNumber()).toBe(800);
    expect(result.liveTotals?.expectedClosingCash.toNumber()).toBe(1800);
  });

  it("CLOSED：不 live 查現金帳（liveTotals=null，groupBy 未被呼叫）", async () => {
    mockSessionFindUnique.mockResolvedValue(
      makeSession({ status: "CLOSED", expectedClosingCash: D(9999) }),
    );

    const result = await getCurrentCashDrawer(STORE_A, new Date(Date.UTC(2026, 4, 13)));

    expect(result.liveTotals).toBeNull();
    expect(mockCashbookGroupBy).not.toHaveBeenCalled();
    expect(mockTxAggregate).not.toHaveBeenCalled();
  });
});

// ============================================================
// 非干擾驗證：本 PR 不應觸發既有表的寫入
// ============================================================

describe("非干擾驗證", () => {
  it("addCashDrawerEntry 不呼叫 Transaction / CashbookEntry 的寫入", async () => {
    mockSessionFindUnique.mockResolvedValue(makeSession());
    mockEntryCreate.mockResolvedValue({ id: "entry-1" });
    await addCashDrawerEntry({
      sessionId: "sess-1",
      type: "CASH_WITHDRAWAL",
      amount: 5000,
      reason: "老闆領現",
      actorUserId: USER_OWNER,
    });
    expect(mockTransactionCreate).not.toHaveBeenCalled();
    expect(mockTransactionUpdate).not.toHaveBeenCalled();
    expect(mockCashbookCreate).not.toHaveBeenCalled();
    expect(mockCashbookUpdate).not.toHaveBeenCalled();
  });

  it("closeCashDrawer 不呼叫 Transaction / CashbookEntry 的寫入", async () => {
    mockSessionFindUnique.mockResolvedValue(
      makeSession({ openingBookBalance: D(5000), openingActualCash: D(5000) }),
    );
    mockSessionUpdate.mockResolvedValue({ id: "sess-1" });
    await closeCashDrawer({
      sessionId: "sess-1",
      closingActualCash: 5000,
      actorUserId: USER_OWNER,
    });
    expect(mockTransactionCreate).not.toHaveBeenCalled();
    expect(mockTransactionUpdate).not.toHaveBeenCalled();
    expect(mockCashbookCreate).not.toHaveBeenCalled();
    expect(mockCashbookUpdate).not.toHaveBeenCalled();
  });

  it("openCashDrawer 不呼叫 Transaction / CashbookEntry 的寫入", async () => {
    mockSessionFindFirst.mockResolvedValue(
      makeSession({ status: "CLOSED", finalBookBalance: D(8100) }),
    );
    mockSessionCreate.mockResolvedValue({ id: "sess-day2" });
    await openCashDrawer({
      storeId: STORE_A,
      businessDate: new Date(Date.UTC(2026, 4, 14)),
      openingActualCash: 8100,
      actorUserId: USER_OWNER,
    });
    expect(mockTransactionCreate).not.toHaveBeenCalled();
    expect(mockCashbookCreate).not.toHaveBeenCalled();
  });

  it("computeCashIncomeForSession 用的 storeId 來自 session（多店隔離）", async () => {
    mockTxAggregate.mockResolvedValue({ _sum: { amount: null } });
    await computeCashIncomeForSession({
      storeId: STORE_B,
      businessDate: new Date(Date.UTC(2026, 4, 13)),
    });
    const call = mockTxAggregate.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(call.where.storeId).toBe(STORE_B);
    expect(call.where.storeId).not.toBe(STORE_A);
  });
});
