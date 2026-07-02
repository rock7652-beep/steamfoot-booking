import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    store: {
      count: vi.fn(),
    },
  },
}));

describe("brand overview foundation", () => {
  it("defaults to this month when period is missing or invalid", async () => {
    const { resolveBrandOverviewPeriod } = await import("@/server/queries/brand-overview");

    expect(resolveBrandOverviewPeriod(undefined)).toBe("month");
    expect(resolveBrandOverviewPeriod("unknown")).toBe("month");
  });

  it("accepts supported period values and normalizes arrays", async () => {
    const { resolveBrandOverviewPeriod } = await import("@/server/queries/brand-overview");

    expect(resolveBrandOverviewPeriod("last30")).toBe("last30");
    expect(resolveBrandOverviewPeriod("year")).toBe("year");
    expect(resolveBrandOverviewPeriod("custom")).toBe("custom");
    expect(resolveBrandOverviewPeriod(["year", "month"])).toBe("year");
  });
});
