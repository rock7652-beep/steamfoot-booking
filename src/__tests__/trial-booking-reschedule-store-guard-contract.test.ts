import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/server/services/trial-booking-self-service.ts",
  "utf8",
);

describe("trial booking reschedule store write guard", () => {
  it("checks operating and subscription state before listing slots", () => {
    expect(source).toContain('import { isStoreBookable } from "@/lib/store-operating-status"');
    expect(source).toContain('import { isStoreSubscriptionWriteBlocked } from "@/lib/subscription-guard"');

    const listStart = source.indexOf("export async function listTrialRescheduleSlots");
    const rescheduleStart = source.indexOf("export async function rescheduleTrialBooking");
    const listBody = source.slice(listStart, rescheduleStart);

    expect(listBody).toContain("isRescheduleStoreWritable(booking.storeId)");
    expect(listBody.indexOf("isRescheduleStoreWritable(booking.storeId)"))
      .toBeLessThan(listBody.indexOf("loadDayBusinessHoursContext"));
  });

  it("re-checks write access immediately before the reschedule transaction", () => {
    const rescheduleStart = source.indexOf("export async function rescheduleTrialBooking");
    const rescheduleBody = source.slice(rescheduleStart);
    const checks = [...rescheduleBody.matchAll(/isRescheduleStoreWritable\(booking\.storeId\)/g)];

    expect(checks).toHaveLength(2);
    expect(checks[1]?.index).toBeLessThan(rescheduleBody.indexOf("prisma.$transaction"));
  });

  it("uses the party size re-read inside the transaction for capacity", () => {
    const rescheduleStart = source.indexOf("export async function rescheduleTrialBooking");
    const rescheduleBody = source.slice(rescheduleStart);

    expect(rescheduleBody).toContain("slotTime: true, people: true");
    expect(rescheduleBody).toContain("+ current.people > slot.capacity");
    expect(rescheduleBody).not.toContain("+ booking.people > slot.capacity");
    expect(rescheduleBody).toContain("originalBookingDate: current.bookingDate, originalSlotTime: current.slotTime");
  });
});
