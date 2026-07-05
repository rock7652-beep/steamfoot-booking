import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ServiceFeeCalculatorSummary } from "@/server/services/service-fee-calculator";
import type { StoreSettlementRecord } from "@/server/services/store-settlements";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/components/dashboard-link", () => ({
  DashboardLink: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => React.createElement("a", { href, className }, children),
}));

vi.mock("@/server/actions/store-settlement", () => ({
  confirmStoreSettlementAction: vi.fn(),
  reopenStoreSettlementAction: vi.fn(),
  saveStoreSettlementAction: vi.fn(),
}));

import { ServiceFeeCalculatorForm } from "@/app/(dashboard)/dashboard/service-fee-calculator/calculator-form";
import { SETTLEMENT_LOCKED_MESSAGE } from "@/app/(dashboard)/dashboard/service-fee-calculator/settlement-lock-state";

const summary: ServiceFeeCalculatorSummary = {
  storeId: "store-1",
  storeName: "測試店",
  month: "2026-07",
  range: {
    startDate: "2026-07-01",
    endDate: "2026-07-31",
    transactionStart: new Date("2026-06-30T16:00:00.000Z"),
    transactionEnd: new Date("2026-07-31T16:00:00.000Z"),
  },
  grossRevenue: 12000,
  refundAmount: 2000,
  netRevenue: 10000,
  revenueTransactionCount: 5,
  refundTransactionCount: 1,
};

function settlement(overrides: Partial<StoreSettlementRecord> = {}): StoreSettlementRecord {
  return {
    id: "settlement-1",
    storeId: "store-1",
    storeName: "測試店",
    month: "2026-07",
    grossRevenue: 12000,
    refundAmount: 2000,
    netRevenue: 10000,
    transactionCount: 6,
    fixedMonthlyFee: 3000,
    revenueShareRate: 10,
    revenueShareAmount: 1000,
    additionalAmount: 500,
    deductionAmount: 200,
    finalReceivable: 12300,
    note: "本月調整",
    status: "DRAFT",
    createdAt: new Date("2026-07-05T00:00:00.000Z"),
    updatedAt: new Date("2026-07-05T00:00:00.000Z"),
    ...overrides,
  };
}

describe("ServiceFeeCalculatorForm confirmed lock state", () => {
  it("renders CSV export link when the selected month has a saved settlement", () => {
    const html = renderToStaticMarkup(
      React.createElement(ServiceFeeCalculatorForm, {
        summary,
        currentSettlement: settlement(),
        settlements: [settlement()],
        canSave: true,
      }),
    );

    expect(html).toContain("匯出月結 CSV");
    expect(html).toContain("/api/store-settlements/export?month=2026-07");
  });

  it("renders a friendly export hint before the selected month is saved", () => {
    const html = renderToStaticMarkup(
      React.createElement(ServiceFeeCalculatorForm, {
        summary,
        currentSettlement: null,
        settlements: [],
        canSave: true,
      }),
    );

    expect(html).toContain("尚未儲存月結單，儲存後即可匯出。");
    expect(html).not.toContain("匯出月結 CSV");
  });

  it("renders a locked form with disabled inputs and reopen affordance when confirmed", () => {
    const html = renderToStaticMarkup(
      React.createElement(ServiceFeeCalculatorForm, {
        summary,
        currentSettlement: settlement({ status: "CONFIRMED" }),
        settlements: [settlement({ status: "CONFIRMED" })],
        canSave: true,
      }),
    );

    expect(html).toContain(SETTLEMENT_LOCKED_MESSAGE);
    expect(html).toContain("解除確認");
    expect(html).toContain("已確認");
    expect(html).not.toContain("確認狀態目前不鎖定修改");
    expect((html.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });
});
