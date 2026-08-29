import { describe, expect, it } from "vitest";
import { composeSpaBookingTreatments } from "@/lib/spa-booking-composition";

const treatments = [
  {
    id: "body-90",
    name: "全身芳療",
    variantLabel: "90 分鐘",
    price: 2500,
    serviceMinutes: 90,
    bufferMinutes: 15,
    skillKeys: ["body"],
    kind: "SERVICE" as const,
    resourceType: "BED" as const,
  },
  {
    id: "head-30",
    name: "頭部舒壓",
    variantLabel: "30 分鐘",
    price: 800,
    serviceMinutes: 30,
    bufferMinutes: 10,
    skillKeys: ["head"],
    kind: "ADD_ON" as const,
    resourceType: "BED" as const,
  },
] as const;

describe("SPA booking service composition", () => {
  it("accumulates service but applies the longest cleanup once", () => {
    expect(composeSpaBookingTreatments(treatments)).toMatchObject({
      treatmentIds: ["body-90", "head-30"],
      displayName: "全身芳療 90 分鐘＋頭部舒壓 30 分鐘",
      totalPrice: 3300,
      serviceMinutes: 120,
      bufferMinutes: 15,
      occupiedMinutes: 135,
      requiredSkillKeys: ["body", "head"],
      resourceType: "BED",
    });
  });

  it("requires exactly one main service or fixed combo", () => {
    expect(() => composeSpaBookingTreatments([treatments[1]])).toThrow(
      "請選擇一個主要服務或固定套餐",
    );
  });

  it("requires every selected service only once", () => {
    expect(() => composeSpaBookingTreatments([])).toThrow("請至少選擇一項服務");
    expect(() => composeSpaBookingTreatments([treatments[0], treatments[0]])).toThrow(
      "服務項目不可重複選擇",
    );
  });
});
