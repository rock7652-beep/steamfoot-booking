import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync(
  "src/app/(liff)/liff/health/health-view.tsx",
  "utf8",
);

describe("LIFF central health history UI", () => {
  it("keeps history and charts inside LIFF and identifies the source store", () => {
    expect(view).toContain("HealthTrendChartLoader");
    expect(view).toContain("HealthHistoryList");
    expect(view).toContain("量測門市：");
    expect(view).toContain("verifiedStoreCount");
    expect(view).not.toContain("function ViewFullButton");
  });
});
