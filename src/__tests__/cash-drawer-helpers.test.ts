/**
 * Cash Drawer 純邏輯 helper 單元測試（無 DB 依賴）
 *
 * 涵蓋：
 *   - computeOpeningDifference
 *   - computeExpectedClosingCash（含 finalBookBalance = expectedClosingCash 鐵則）
 *   - computeClosingDifference
 *   - assertSessionMutable（CLOSED 鎖定）
 *   - resolveDirectionForType（WITHDRAWAL/DEPOSIT 自動、ADJUSTMENT 顯式）
 */

import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  computeOpeningDifference,
  computeExpectedClosingCash,
  computeClosingDifference,
  assertSessionMutable,
  resolveDirectionForType,
} from "@/server/services/cash-drawer";

const D = (n: number) => new Prisma.Decimal(n);

describe("computeOpeningDifference", () => {
  it("實點等於帳面時為 0", () => {
    expect(computeOpeningDifference(D(5050), D(5050)).toNumber()).toBe(0);
  });

  it("實點短少時為負數", () => {
    expect(computeOpeningDifference(D(5000), D(5050)).toNumber()).toBe(-50);
  });

  it("實點溢出時為正數", () => {
    expect(computeOpeningDifference(D(5100), D(5050)).toNumber()).toBe(50);
  });
});

describe("computeExpectedClosingCash 滾動結餘公式", () => {
  it("套用完整公式（含 cashAdjustmentTotal 為正）", () => {
    const result = computeExpectedClosingCash({
      openingBookBalance: D(5000),
      cashIncomeTotal: D(8000),
      cashExpenseTotal: D(1000),
      cashWithdrawalTotal: D(3000),
      cashDepositTotal: D(500),
      cashAdjustmentTotal: D(100),
    });
    expect(result.toNumber()).toBe(5000 + 8000 - 1000 - 3000 + 500 + 100);
  });

  it("cashAdjustmentTotal 為負數時正確扣除", () => {
    const result = computeExpectedClosingCash({
      openingBookBalance: D(5000),
      cashIncomeTotal: D(0),
      cashExpenseTotal: D(0),
      cashWithdrawalTotal: D(0),
      cashDepositTotal: D(0),
      cashAdjustmentTotal: D(-200),
    });
    expect(result.toNumber()).toBe(4800);
  });

  it("用 openingBookBalance 計算（不該被 actualCash 影響）", () => {
    // 鐵則：expectedClosingCash 用 openingBookBalance，不用 openingActualCash
    // 此測試只能在 computeExpectedClosingCash 簽名上驗證 — 它根本不接受 actualCash 參數
    const result = computeExpectedClosingCash({
      openingBookBalance: D(5050),
      cashIncomeTotal: D(0),
      cashExpenseTotal: D(0),
      cashWithdrawalTotal: D(0),
      cashDepositTotal: D(0),
      cashAdjustmentTotal: D(0),
    });
    expect(result.toNumber()).toBe(5050);
  });
});

describe("computeClosingDifference", () => {
  it("實點等於應有時為 0", () => {
    expect(computeClosingDifference(D(13000), D(13000)).toNumber()).toBe(0);
  });

  it("實點短少時為負數", () => {
    expect(computeClosingDifference(D(12900), D(13000)).toNumber()).toBe(-100);
  });

  it("實點溢出時為正數", () => {
    expect(computeClosingDifference(D(13050), D(13000)).toNumber()).toBe(50);
  });
});

describe("assertSessionMutable", () => {
  it("OPEN session 通過", () => {
    expect(() =>
      assertSessionMutable({ status: "OPEN" } as never),
    ).not.toThrow();
  });

  it("CLOSED session 拋 BUSINESS_RULE", () => {
    expect(() =>
      assertSessionMutable({ status: "CLOSED" } as never),
    ).toThrow(/閉店鎖定/);
  });

  it("NEED_REVIEW session 通過（預留覆核流程，PR-2 不會寫入此狀態）", () => {
    expect(() =>
      assertSessionMutable({ status: "NEED_REVIEW" } as never),
    ).not.toThrow();
  });
});

describe("resolveDirectionForType", () => {
  it("CASH_WITHDRAWAL 自動為 OUT", () => {
    expect(resolveDirectionForType("CASH_WITHDRAWAL")).toBe("OUT");
  });

  it("CASH_DEPOSIT 自動為 IN", () => {
    expect(resolveDirectionForType("CASH_DEPOSIT")).toBe("IN");
  });

  it("CASH_ADJUSTMENT 沒傳 direction 拋 VALIDATION", () => {
    expect(() => resolveDirectionForType("CASH_ADJUSTMENT")).toThrow(/direction/);
  });

  it("CASH_ADJUSTMENT 顯式 IN", () => {
    expect(resolveDirectionForType("CASH_ADJUSTMENT", "IN")).toBe("IN");
  });

  it("CASH_ADJUSTMENT 顯式 OUT", () => {
    expect(resolveDirectionForType("CASH_ADJUSTMENT", "OUT")).toBe("OUT");
  });
});
