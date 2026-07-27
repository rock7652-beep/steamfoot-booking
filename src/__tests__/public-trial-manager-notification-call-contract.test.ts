import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../server/actions/public-trial-booking.ts", import.meta.url),
  "utf8",
);

describe("public trial manager notification call contract", () => {
  it("calls the manager notification only after the booking transaction commits", () => {
    const transactionIndex = source.indexOf("const booking = await prisma.$transaction");
    const slotFullIndex = source.indexOf('if (!booking) return { status: "slot_full" };');
    const notificationIndex = source.indexOf("await notifyManagerOfPublicTrialBooking({");
    const successReturnIndex = source.indexOf('status: "ok"', notificationIndex);

    expect(transactionIndex).toBeGreaterThan(-1);
    expect(slotFullIndex).toBeGreaterThan(transactionIndex);
    expect(notificationIndex).toBeGreaterThan(slotFullIndex);
    expect(successReturnIndex).toBeGreaterThan(notificationIndex);
  });

  it("uses bookingId as the unique business event identity", () => {
    expect(source).toContain("bookingId: booking.id");
    expect(source.match(/notifyManagerOfPublicTrialBooking\(/g)).toHaveLength(1);
  });
});
