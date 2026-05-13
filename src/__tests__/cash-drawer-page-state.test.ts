/**
 * Cash Drawer page state derivation — pure logic tests
 *
 * 測 `deriveCashDrawerView` 純函式，不打 DB、不渲染 component。
 *
 * 4 種 state 條件（與 page UI 對應）：
 *   - EMPTY：店家完全沒任何 session
 *   - OPENED_TODAY：今日已有 session（init 當天也會直接進此 state）
 *   - WARNING_LAST_OPEN：今日沒 session，但上一個 session 仍 OPEN（未閉店）
 *   - NOT_OPENED_TODAY：今日沒 session，且上一個 session 已 CLOSED → 可開店
 */

import { describe, it, expect } from "vitest";
import type { CashDrawerSession } from "@prisma/client";
import { deriveCashDrawerView } from "@/server/queries/cash-drawer";

const stub = (overrides: Partial<CashDrawerSession>): CashDrawerSession =>
  ({
    id: "sess-1",
    storeId: "store-zhubei",
    businessDate: new Date(Date.UTC(2026, 4, 13)),
    status: "OPEN",
    openingBookBalance: null as never,
    openingActualCash: null as never,
    openingDifference: null as never,
    openingNote: null,
    openedByUserId: "user-1",
    openedAt: new Date("2026-05-13T01:00:00Z"),
    cashIncomeTotal: null as never,
    cashExpenseTotal: null as never,
    cashWithdrawalTotal: null as never,
    cashDepositTotal: null as never,
    cashAdjustmentTotal: null as never,
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
  } as CashDrawerSession);

describe("deriveCashDrawerView", () => {
  it("EMPTY：沒有任何 session", () => {
    const view = deriveCashDrawerView(null, null);
    expect(view.state).toBe("EMPTY");
  });

  it("OPENED_TODAY：今日有 OPEN session", () => {
    const today = stub({ status: "OPEN" });
    const view = deriveCashDrawerView(today, today);
    expect(view.state).toBe("OPENED_TODAY");
    if (view.state === "OPENED_TODAY") {
      expect(view.session.id).toBe(today.id);
    }
  });

  it("OPENED_TODAY：初始化當天直接進此 state（不應退回 NOT_OPENED_TODAY）", () => {
    // 首次啟用：today session 是該店唯一存在的 session
    const todayInit = stub({ id: "sess-init", status: "OPEN" });
    const view = deriveCashDrawerView(todayInit, todayInit);
    expect(view.state).toBe("OPENED_TODAY");
  });

  it("OPENED_TODAY：今日 CLOSED session（PR-5 行為，PR-3 不會發生但驗證 forward-compat）", () => {
    const todayClosed = stub({ status: "CLOSED" });
    const view = deriveCashDrawerView(todayClosed, todayClosed);
    expect(view.state).toBe("OPENED_TODAY");
  });

  it("WARNING_LAST_OPEN：今日無 session，上日 session 仍 OPEN", () => {
    const lastOpen = stub({
      id: "sess-yesterday",
      businessDate: new Date(Date.UTC(2026, 4, 12)),
      status: "OPEN",
    });
    const view = deriveCashDrawerView(null, lastOpen);
    expect(view.state).toBe("WARNING_LAST_OPEN");
    if (view.state === "WARNING_LAST_OPEN") {
      expect(view.lastSession.id).toBe("sess-yesterday");
    }
  });

  it("NOT_OPENED_TODAY：今日無 session，上日 CLOSED 可開店", () => {
    const lastClosed = stub({
      id: "sess-yesterday-closed",
      businessDate: new Date(Date.UTC(2026, 4, 12)),
      status: "CLOSED",
      finalBookBalance: null as never,
    });
    const view = deriveCashDrawerView(null, lastClosed);
    expect(view.state).toBe("NOT_OPENED_TODAY");
    if (view.state === "NOT_OPENED_TODAY") {
      expect(view.lastSession.id).toBe("sess-yesterday-closed");
    }
  });

  it("NOT_OPENED_TODAY：跨多日無營業也能正確顯示（上週 CLOSED）", () => {
    const lastClosed = stub({
      id: "sess-last-week",
      businessDate: new Date(Date.UTC(2026, 4, 6)), // 7 天前
      status: "CLOSED",
    });
    const view = deriveCashDrawerView(null, lastClosed);
    expect(view.state).toBe("NOT_OPENED_TODAY");
  });

  it("優先級：今日 session 存在時，無視 latest 為何（防 latest 比 today 還晚的邊界）", () => {
    // 理論上不會發生（unique constraint + lte today filter），但驗證行為穩定
    const today = stub({ status: "OPEN" });
    const view = deriveCashDrawerView(today, null);
    expect(view.state).toBe("OPENED_TODAY");
  });
});
