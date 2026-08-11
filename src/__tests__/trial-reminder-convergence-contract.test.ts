import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("trial reminder convergence contract", () => {
  it("claims Messenger delivery before Meta and releases only recorded failures for retry", () => {
    const worker = source("src/server/services/messenger-utility-reminder.ts");
    expect(worker.indexOf("claimDelivery(input)")).toBeLessThan(worker.indexOf("sendMessengerUtilityTemplate({"));
    expect(worker).toContain('eventType: "MESSENGER_UTILITY_REMINDER"');
    expect(worker).toContain("await releaseClaim(claimId)");
    expect(worker).toContain("Keep the claim when delivery may already have happened");
  });

  it("marks a batch with individual failures as retryable", () => {
    const route = source("src/app/api/cron/reminders/route.ts");
    const retry = source("src/server/reminder-cron-retry.ts");
    expect(route).toContain("reminderFailed || (reminderResult?.failed ?? 0) > 0");
    expect(retry).toContain("if (result.failed > 0) return \"FAILED\"");
  });

  it("persists a consumed chat link and channel in the booking transaction", () => {
    const booking = source("src/server/actions/public-trial-booking.ts");
    expect(booking).toContain("resolveTrialBookingChatLink(data.entry)");
    expect(booking).toContain("trialBookingChannel: chatLink.channel");
    expect(booking).toContain("tx.trialBookingLink.updateMany");
    expect(booking).toContain("bookingId: created.id");
  });

  it("fails closed for anonymous chat links without a signing secret", () => {
    const engine = source("src/server/reminder-engine.ts");
    expect(engine).toContain("TRIAL_BOOKING_ACTION_SECRET_NOT_CONFIGURED");
    expect(engine).not.toContain(
      'booking.bookingType === "FIRST_TRIAL" && booking.trialBookingChannel && process.env.TRIAL_BOOKING_ACTION_SECRET',
    );
  });

  it("rejects the current slot in both listing and mutation paths", () => {
    const selfService = source("src/server/services/trial-booking-self-service.ts");
    expect(selfService).toContain(
      'date === booking.bookingDate.toISOString().slice(0, 10) && slot.startTime === booking.slotTime',
    );
    expect(selfService).toContain(
      'date === booking.bookingDate.toISOString().slice(0, 10) && slotTime === booking.slotTime',
    );
    expect(selfService).toContain(
      'date === current.bookingDate.toISOString().slice(0, 10) && slotTime === current.slotTime',
    );
  });
});
