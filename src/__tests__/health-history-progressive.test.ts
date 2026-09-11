import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const assessmentCard = readFileSync(
  "src/components/health-assessment-card.tsx",
  "utf8",
);
const historyList = readFileSync(
  "src/components/health-history-list.tsx",
  "utf8",
);

describe("progressive health history", () => {
  it("keeps the chart on the full fetched trend while delegating history rendering", () => {
    expect(assessmentCard).toContain("HealthTrendChartLoader trend={summary.trend}");
    expect(assessmentCard).toContain("<HealthHistoryList");
    expect(assessmentCard).toContain("totalRecords={summary.meta.totalRecords}");
  });

  it("renders five records initially and loads five more per tap", () => {
    expect(historyList).toContain("const INITIAL_VISIBLE_RECORDS = 5");
    expect(historyList).toContain("const RECORDS_PER_LOAD = 5");
    expect(historyList).toContain("recentRecords.slice(0, visibleCount)");
    expect(historyList).toContain("Math.min(count + RECORDS_PER_LOAD");
    expect(historyList).toContain("載入更多（尚有 {remainingLoadedRecords} 筆）");
    expect(historyList).toContain("收合紀錄");
  });

  it("clearly identifies the original store on the latest summary and every history row", () => {
    expect(assessmentCard).toContain("量測門市：");
    expect(assessmentCard).toContain("latest.storeName");
    expect(historyList).toContain("量測門市：{record.storeName}");
  });
});
