import { describe, expect, it } from "vitest";
import {
  parsePlanExpiryReminderEnabled,
  planExpiryReminderSettingId,
} from "@/lib/plan-expiry-reminder-setting";

describe("plan expiry reminder setting", () => {
  it("defaults to enabled and persists per store", () => {
    expect(parsePlanExpiryReminderEnabled(undefined)).toBe(true);
    expect(parsePlanExpiryReminderEnabled("enabled")).toBe(true);
    expect(parsePlanExpiryReminderEnabled("disabled")).toBe(false);
    expect(planExpiryReminderSettingId("store-a")).toBe("plan-expiry-reminder-enabled:store-a");
  });
});
