import { describe, it, expect } from "vitest";
import { assignPlanSchema } from "@/lib/validators/plan";

// 購買方案 ID 欄位放寬：customerId / planId 從 .cuid() → .min(1)。
// 背景：staging seed / 匯入資料的 ID 未必是 cuid，原本 .cuid() 會在 parse
// 階段吐「Invalid cuid」擋下合法購買。安全邊界改由 assignPlanToCustomer 的
// customer.findUnique + assertStoreAccess、plan.findUnique({isActive}) +
// storeId guard 負責（與 extendWalletExpirySchema 同款修法）。

const base = {
  customerId: "ck0000000000000000000c01",
  planId: "ck0000000000000000000p01",
  paymentMethod: "CASH" as const,
};

describe("assignPlanSchema — ID 欄位放寬 (.min(1))", () => {
  it("接受 staging 固定字串 ID（非 cuid）", () => {
    expect(() =>
      assignPlanSchema.parse({
        ...base,
        customerId: "staging-customer-001",
        planId: "staging-plan-package-10",
      }),
    ).not.toThrow();
  });

  it("仍接受合法 cuid", () => {
    expect(() => assignPlanSchema.parse(base)).not.toThrow();
  });

  it("空字串 customerId 仍被擋", () => {
    expect(() =>
      assignPlanSchema.parse({ ...base, customerId: "" }),
    ).toThrow();
  });

  it("空字串 planId 仍被擋", () => {
    expect(() => assignPlanSchema.parse({ ...base, planId: "" })).toThrow();
  });

  it("缺少 customerId / planId 仍被擋", () => {
    expect(() =>
      assignPlanSchema.parse({ paymentMethod: "CASH" }),
    ).toThrow();
  });
});

describe("assignPlanSchema — 後台款項狀態", () => {
  it("未指定時預設為已確認收款", () => {
    expect(assignPlanSchema.parse({ ...base, paymentMethod: "TRANSFER" }).paymentStatus)
      .toBe("CONFIRMED");
  });

  it("允許店長明確將轉帳設為尚待確認", () => {
    expect(assignPlanSchema.parse({
      ...base,
      paymentMethod: "TRANSFER",
      paymentStatus: "PENDING",
    }).paymentStatus).toBe("PENDING");
  });

  it("未付款不可標示為已確認", () => {
    expect(() => assignPlanSchema.parse({
      ...base,
      paymentMethod: "UNPAID",
      paymentStatus: "CONFIRMED",
    })).toThrow("未付款的款項狀態必須為尚待確認");
  });
});
