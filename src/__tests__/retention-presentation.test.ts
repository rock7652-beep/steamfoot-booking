import { describe, expect, it } from "vitest";
import { retentionPresentation } from "@/lib/retention-presentation";

describe("回流月份文字", () => {
  const cohort = { startDate: "2026-09-01", endDate: "2026-09-30" };
  it("本月使用相對月份並說明進度", () => {
    const result = retentionPresentation({ startDate: "2026-10-01", endDate: "2026-10-12" }, cohort, "month", "2026-10-12");
    expect(result.title).toBe("上月顧客回流");
    expect(result.description).toBe("上月來過的顧客，有多少在本月再次回來？");
    expect(result.progress).toBe("截至今日");
  });
  it("歷史月份保留年份，避免跨年誤解", () => {
    const result = retentionPresentation({ startDate: "2026-10-01", endDate: "2026-10-31" }, cohort, "month", "2027-01-12");
    expect(result.description).toContain("2026 年 9 月");
    expect(result.description).toContain("2026 年 10 月");
    expect(result.progress).toBe("期間已結束");
  });
  it("自訂期間不誤稱本月", () => {
    const result = retentionPresentation({ startDate: "2026-10-03", endDate: "2026-10-12" }, cohort, "custom", "2026-10-12");
    expect(result.description).toContain("所選期間");
    expect(result.dates).toContain("2026-10-03～2026-10-12");
  });
});
