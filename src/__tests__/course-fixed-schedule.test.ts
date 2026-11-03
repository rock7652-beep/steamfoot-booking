import { describe, expect, it } from "vitest";
import { buildFixedScheduleDates } from "@/lib/course-fixed-schedule";

describe("fixed music course dates", () => {
  it("keeps weekly dates on the same weekday through the selected expiry", () => {
    expect(buildFixedScheduleDates("2026-10-13", "WEEKLY", "2026-10-27").dates)
      .toEqual(["2026-10-13", "2026-10-20", "2026-10-27"]);
  });

  it("uses 14 day intervals for alternating-week fixed classes", () => {
    expect(buildFixedScheduleDates("2026-10-13", "BIWEEKLY", "2026-11-10").dates)
      .toEqual(["2026-10-13", "2026-10-27", "2026-11-10"]);
  });

  it("treats a blank expiry as an explicit 53 occurrence planning window", () => {
    const result = buildFixedScheduleDates("2026-10-13", "WEEKLY");
    expect(result.dates).toHaveLength(53);
    expect(result.lastSupportedDate).toBe("2027-10-12");
  });

  it("rejects invalid dates and expiry dates outside the supported planning window", () => {
    expect(buildFixedScheduleDates("2026-02-30", "WEEKLY").error).toBe("請選擇有效的開始日期");
    expect(buildFixedScheduleDates("2026-10-13", "WEEKLY", "2026-10-12").error).toBe("有效期限不能早於開始日期");
    expect(buildFixedScheduleDates("2026-10-13", "WEEKLY", "2027-10-13").error).toContain("53 次");
  });
});
