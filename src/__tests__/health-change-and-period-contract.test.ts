import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const assessmentCard = readFileSync(
  "src/components/health-assessment-card.tsx",
  "utf8",
);
const trendChart = readFileSync(
  "src/components/health-trend-chart.tsx",
  "utf8",
);
const nativeService = readFileSync(
  "src/lib/native-health-service.ts",
  "utf8",
);

describe("health change and period presentation contract", () => {
  it("compares the latest record with the immediately previous record, including the same date", () => {
    expect(assessmentCard).toContain("summary.trend[summary.trend.length - 2]");
    expect(assessmentCard).not.toContain("different date");
    expect(nativeService).toContain('orderBy: [{ measuredAt: "desc"');
    expect(nativeService).toContain('{ createdAt: "desc"');
    expect(assessmentCard).toContain("首次量測，尚無上次紀錄可比較");
  });

  it("keeps four core changes prominent and defers the remaining changes", () => {
    expect(assessmentCard).toContain('label: "體重"');
    expect(assessmentCard).toContain('label: "體脂肪"');
    expect(assessmentCard).toContain('label: "肌肉量"');
    expect(assessmentCard).toContain('label: "內臟脂肪"');
    expect(assessmentCard).toContain("查看全部變化");
    expect(assessmentCard).not.toContain("向目標前進");
  });

  it("defaults the chart to six records and offers the agreed period choices", () => {
    expect(trendChart).toContain('useState<Period>("recent6")');
    expect(trendChart).toContain('label: "近6次"');
    expect(trendChart).toContain('label: "1個月"');
    expect(trendChart).toContain('label: "3個月"');
    expect(trendChart).toContain('label: "6個月"');
    expect(trendChart).toContain('label: "12個月"');
    expect(trendChart).toContain('label: "全部"');
    expect(trendChart).toContain("trend.slice(-6)");
  });
});
