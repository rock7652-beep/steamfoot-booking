import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("incomplete service reminder contract", () => {
  it("waits for service duration plus 60-minute grace and only scans incomplete bookings", () => {
    const worker = source("src/server/services/incomplete-service-reminders.ts");

    expect(worker).toContain("SERVICE_DURATION_MINUTES = 60");
    expect(worker).toContain("REMINDER_GRACE_MINUTES = 60");
    expect(worker).toContain('bookingStatus: { in: ["PENDING", "CONFIRMED"] }');
    expect(worker).toContain("reminderDueAt");
  });

  it("re-checks status after claiming and deduplicates by booking", () => {
    const worker = source("src/server/services/incomplete-service-reminders.ts");

    expect(worker).toContain('eventKey = `incomplete-service-reminder:${candidate.id}`');
    expect(worker).toContain("digitalButlerExecutionLog.create");
    expect(worker).toContain("stillIncomplete");
    expect(worker).toContain("concurrent completion, cancellation, or no-show wins");
  });

  it("keeps the worker endpoint protected but unscheduled on Vercel Hobby", () => {
    const route = source("src/app/api/cron/incomplete-service-reminders/route.ts");
    const vercel = source("vercel.json");
    const messages = source("src/server/services/store-manager-line-notifications.ts");

    expect(route).toContain("CRON_SECRET");
    expect(route).toContain("Bearer ${cronSecret}");
    expect(vercel).not.toContain('"path": "/api/cron/incomplete-service-reminders"');
    expect(messages).toContain("🔔 服務尚未完成");
    expect(messages).toContain("前往後台處理");
  });
});
