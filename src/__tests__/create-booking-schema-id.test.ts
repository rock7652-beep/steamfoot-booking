import { describe, it, expect } from "vitest";
import { createBookingSchema } from "@/lib/validators/booking";

// createBookingSchema 的 ID validators 放寬（同 #236 assignPlanSchema）：
//  - servicePlanId / customerPlanWalletId / makeupCreditId 由 .cuid() → .min(1)
//  - 原因：staging seed / 匯入 / 固定 ID（如 "staging-wallet-001"）未必是 cuid，
//    安全邊界靠 createBooking 內 DB lookup + store guard，不靠 ID 格式。
//  - 空字串仍被擋；缺值仍符合 optional；合法 cuid 仍通過。

const baseValid = {
  customerId: "staging-cust-001",
  bookingDate: "2026-06-03",
  slotTime: "14:00",
  bookingType: "PACKAGE_SESSION" as const,
};

describe("createBookingSchema — ID validators 放寬為 .min(1)", () => {
  it("1. customerPlanWalletId 接受 staging fixed ID", () => {
    expect(() =>
      createBookingSchema.parse({
        ...baseValid,
        customerPlanWalletId: "staging-wallet-001",
      }),
    ).not.toThrow();
  });

  it("2. servicePlanId 接受 staging fixed ID", () => {
    expect(() =>
      createBookingSchema.parse({
        ...baseValid,
        servicePlanId: "staging-plan-pkg10",
      }),
    ).not.toThrow();
  });

  it("3. makeupCreditId 接受非 cuid ID", () => {
    expect(() =>
      createBookingSchema.parse({
        ...baseValid,
        isMakeup: true,
        makeupCreditId: "staging-makeup-001",
      }),
    ).not.toThrow();
  });

  it("4. 空字串仍被擋（.min(1)）", () => {
    expect(() =>
      createBookingSchema.parse({ ...baseValid, customerPlanWalletId: "" }),
    ).toThrow();
    expect(() =>
      createBookingSchema.parse({ ...baseValid, servicePlanId: "" }),
    ).toThrow();
    expect(() =>
      createBookingSchema.parse({ ...baseValid, makeupCreditId: "" }),
    ).toThrow();
  });

  it("5. 缺值 / undefined 仍符合 optional", () => {
    expect(() => createBookingSchema.parse({ ...baseValid })).not.toThrow();
    expect(() =>
      createBookingSchema.parse({
        ...baseValid,
        servicePlanId: undefined,
        customerPlanWalletId: undefined,
        makeupCreditId: undefined,
      }),
    ).not.toThrow();
  });

  it("6. 原本合法 cuid 仍通過", () => {
    expect(() =>
      createBookingSchema.parse({
        ...baseValid,
        customerId: "cmpwtlj470001l404kktppetp",
        customerPlanWalletId: "cmpxh0brm0005jr04avm66x60",
        servicePlanId: "cmprv03q00001kz04q9glnb0p",
      }),
    ).not.toThrow();
  });
});
