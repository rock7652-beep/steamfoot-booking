import { describe, expect, it } from "vitest";
import { classifyReminderHealth } from "@/lib/reminder-health";

describe("classifyReminderHealth", () => {
  it.each([
    [{ enabled: false, phase: "OK", sent: 3, skipped: 0, failed: 0 }, "DISABLED"],
    [{ enabled: true, phase: "BEFORE_WINDOW", sent: 0, skipped: 0, failed: 0 }, "WAITING"],
    [{ enabled: true, phase: "OK", sent: 3, skipped: 0, failed: 0 }, "HEALTHY"],
    [{ enabled: true, phase: "OK", sent: 2, skipped: 1, failed: 0 }, "NEEDS_ATTENTION"],
    [{ enabled: true, phase: "OK", sent: 2, skipped: 0, failed: 1 }, "NEEDS_ATTENTION"],
    [{ enabled: true, phase: "OK_EMPTY", sent: 0, skipped: 0, failed: 0 }, "NO_RECORDS"],
    [{ enabled: true, phase: "MISSING", sent: 0, skipped: 0, failed: 0 }, "SCHEDULE_ERROR"],
  ] as const)("classifies %o as %s", (input, expected) => {
    expect(classifyReminderHealth(input)).toBe(expected);
  });
});
