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
  },
  {
    id: "head-30",
    name: "頭部舒壓",
    variantLabel: "30 分鐘",
    price: 800,
    serviceMinutes: 30,
    bufferMinutes: 10,
    skillKeys: ["head"],
  },
] as const;

describe("SPA booking service composition", () => {
  it("accumulates service, cleanup, occupied time and price", () => {
    expect(composeSpaBookingTreatments(treatments)).toMatchObject({
      treatmentIds: ["body-90", "head-30"],
      displayName: "全身芳療 90 分鐘＋頭部舒壓 30 分鐘",
      totalPrice: 3300,
      serviceMinutes: 120,
      bufferMinutes: 25,
      occupiedMinutes: 145,
      requiredSkillKeys: ["body", "head"],
    });
  });

  it("requires every selected service only once", () => {
    expect(() => composeSpaBookingTreatments([])).toThrow("請至少選擇一項服務");
    expect(() => composeSpaBookingTreatments([treatments[0], treatments[0]])).toThrow(
      "服務項目不可重複選擇",
    );
  });
});
