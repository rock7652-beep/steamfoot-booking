import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../app/(customer)/book/new/booking-calendar-view.tsx", import.meta.url),
  "utf8",
);

describe("customer recurring booking UI wiring", () => {
  it("keeps the recurring UI behind the store feature flag", () => {
    expect(source).toContain("weeklyRecurrenceEnabled && recurrenceOptions.length > 0");
    expect(source).toContain("保留每週固定時段");
    expect(source).toContain("selectedSlot && weeklyRecurrenceEnabled");
  });

  it("uses the existing recurring action with the stable request key", () => {
    expect(source).toContain("createRecurringBookings({");
    expect(source).toContain("servicePlanId: selectedPlanWallet?.planId ?? \"\"");
    expect(source).toContain('source: "web-customer-recurring"');
    expect(source).toContain("requestKey.current()");
    expect(source).toContain("requestKey.complete()");
  });

  it("does not allow client preview failures to submit a partial recurring booking", () => {
    expect(source).toContain("recurrenceHasUnavailableDate");
    expect(source).toContain("無法建立循環預約");
    expect(source).toContain("loadingRecurringPreview");
  });

  it("uses real AVAILABLE WalletSession counts for recurring eligibility", () => {
    expect(source).toContain("recurringAvailableSessions");
    expect(source).toContain("wallet.recurringAvailableSessions");
    expect(source).toContain("formatBookingWalletOption(w, isRecurringActive)");
    expect(source).not.toContain("formatRecurringWalletOption");
  });

  it("offers the maximum affordable week count instead of only blocking", () => {
    expect(source).toContain("maxAffordableWeeks");
    expect(source).toContain("改為保留 {maxAffordableWeeks} 週");
    expect(source).toContain("完成每次服務後才核銷");
  });

  it("keeps the selected slot status readable on the dark selection background", () => {
    expect(source).toContain('selectedSlot === slot.startTime ? "text-white/90"');
  });
});
