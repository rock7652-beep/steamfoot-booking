import { describe, expect, it } from "vitest";
import { purchasePlanForSingleBookingSchema } from "@/lib/validators/booking-checkout";

describe("purchasePlanForSingleBookingSchema", () => {
  it("accepts actual amount plus optional discount reason and note", () => {
    expect(() => purchasePlanForSingleBookingSchema.parse({
      bookingId: "booking-1",
      planId: "plan-1",
      paymentMethod: "CASH",
      amount: 9_000,
      discountReason: "開幕優惠",
      note: "顧客現場確認",
    })).not.toThrow();
  });

  it("keeps note optional but requires a positive actual amount", () => {
    expect(() => purchasePlanForSingleBookingSchema.parse({
      bookingId: "booking-1",
      planId: "plan-1",
      paymentMethod: "CASH",
      amount: 9_000,
    })).not.toThrow();
    expect(() => purchasePlanForSingleBookingSchema.parse({
      bookingId: "booking-1",
      planId: "plan-1",
      paymentMethod: "CASH",
      amount: 0,
    })).toThrow();
  });
});
