import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { generateSlots, validateBusinessPeriods } from "@/lib/slot-generator";

describe("service hours review", () => {
  it("previews half-hour morning starts and whole-hour afternoon starts with a break", () => {
    const periods = [
      { openTime: "08:30", closeTime: "12:30", slotInterval: 60, defaultCapacity: 6 },
      { openTime: "14:00", closeTime: "18:00", slotInterval: 60, defaultCapacity: 6 },
    ];
    expect(validateBusinessPeriods(periods).valid).toBe(true);
    expect(periods.flatMap((p) => generateSlots(p.openTime, p.closeTime, p.slotInterval, p.defaultCapacity)).map((s) => s.startTime))
      .toEqual(["08:30", "09:30", "10:30", "11:30", "14:00", "15:00", "16:00", "17:00"]);
  });

  it("rejects overlapping periods before confirmation", () => {
    expect(validateBusinessPeriods([
      { openTime: "08:30", closeTime: "12:30", slotInterval: 60, defaultCapacity: 6 },
      { openTime: "12:00", closeTime: "18:00", slotInterval: 60, defaultCapacity: 6 },
    ]).valid).toBe(false);
  });

  const source = readFileSync("src/app/(dashboard)/dashboard/settings/hours/schedule-manager.tsx", "utf8");
  it("requires review of the current draft before saving and blocks pending edits", () => {
    expect(source).toContain("reviewedDraft === draftKey");
    expect(source).toContain("if (reviewing) void saveDay(); else setReviewedDraft(draftKey)");
    expect(source).toContain("fieldset disabled={isPending || loadingDay}");
    expect(source).toContain('"確認並儲存" : "檢查變更"');
  });
  it("selecting the displayed two-week option sets a nonzero copy duration", () => {
    expect(source).toContain("setCopyWeeks((weeks) => weeks || 2)");
  });
});
