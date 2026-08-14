import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("customer booking reschedule contract", () => {
  it("uses a twelve-hour cutoff for both trial and package self-service", () => {
    const trial = source("src/server/services/trial-booking-self-service.ts");
    const customer = source("src/server/actions/customer-booking-reschedule.ts");
    const trialPage = source("src/app/trial-booking/manage/trial-booking-manager.tsx");
    expect(trial).toContain("12 * 60 * 60 * 1000");
    expect(customer).toContain("12 * 60 * 60 * 1000");
    expect(trialPage).toContain("距離預約 12 小時內請直接聯絡門市");
    expect(trialPage).not.toContain("距離預約兩小時內");
  });

  it("revalidates customer ownership, store writability, capacity and one-change limit", () => {
    const action = source("src/server/actions/customer-booking-reschedule.ts");
    expect(action).toContain("requireCustomerBookingEligibility");
    expect(action).toContain("eligibility.customerId !== booking.customerId");
    expect(action).toContain("eligibility.storeId !== booking.storeId");
    expect(action).toContain("isStoreBookable(storeId)");
    expect(action).toContain("isStoreSubscriptionWriteBlocked(storeId)");
    expect(action).toContain("customerRescheduleCount < CUSTOMER_RESCHEDULE_LIMIT");
    expect(action).toContain("Prisma.TransactionIsolationLevel.Serializable");
    expect(action).toContain("NOT: { id: booking.id }");
    expect(action).toContain('return "slot_full"');
    expect(action).toContain("entitlementCoversDate");
    expect(action).toContain("if (booking.isMakeup) return false");
    expect(action).toContain('where: { status: "RESERVED" }');
    expect(action).toContain("wallets.every");
    expect(action).toContain('wallet.status === "ACTIVE"');
    expect(action).toContain("resolveBookableUntilDate");
    expect(action).toContain("storeBookingHorizonAllows");
    expect(action).toContain("tx.shopConfig.findUnique");
    expect(action).toContain('parseTaipeiDateTime(date, "00:00") !== null');
    expect(action).toContain("date === current.bookingDate.toISOString().slice(0, 10)");
    expect(action).toContain("slotTime === current.slotTime");
  });

  it("updates the original booking without touching plan wallets or sessions", () => {
    const action = source("src/server/actions/customer-booking-reschedule.ts");
    expect(action).toContain("originalBookingDate: current.bookingDate");
    expect(action).toContain("originalSlotTime: current.slotTime");
    expect(action).toContain("customerRescheduleCount: { increment: 1 }");
    expect(action).not.toContain("customerPlanWallet.update");
    expect(action).not.toContain("walletSession.update");
    expect(action).not.toContain("booking.create");
  });

  it("routes package LINE card actions to booking-specific customer pages", () => {
    const message = source("src/server/services/trial-booking-reminder-line-message.ts");
    expect(message).toContain('label: "改時段"');
    expect(message).toContain('actionUrl("reschedule")');
    expect(message).toContain('label: "取消前往"');
    expect(message).toContain('actionUrl("cancel")');
    expect(message).toContain("encodeURIComponent(bookingId)");
  });

  it("loads same-day alternatives as soon as the reschedule page opens", () => {
    const manager = source("src/app/(customer)/my-bookings/[id]/reschedule/reschedule-manager.tsx");
    expect(manager).toContain("listCustomerBookingRescheduleSlots(bookingId, status.bookingDate)");
  });

  it("exposes the safe reschedule route from the normal customer booking list", () => {
    const page = source("src/app/(customer)/my-bookings/page.tsx");
    expect(page).toContain('b.bookingType === "PACKAGE_SESSION" || b.bookingType === "SINGLE"');
    expect(page).toContain("!b.isMakeup");
    expect(page).toContain("b.customerRescheduleCount < 1");
    expect(page).toContain("/reschedule`");
    expect(page).toContain("更改時間");
  });
});
