import { describe, expect, it, vi } from "vitest";
const findMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ prisma: { booking: { findMany } } }));
import { getMonthlyVisitorOverview, monthlyVisitorRanges } from "@/server/queries/monthly-visitor-overview";
import { parseTaiwanDateToDbDate as date } from "@/lib/date-utils";

describe("monthly visitor overview", () => {
  it("shows month-to-date, matching prior dates and the entire prior month", () => {
    const ranges = monthlyVisitorRanges("2026-09-26");
    expect(ranges.map(r => [r.startDate, r.endDate])).toEqual([
      ["2026-09-01", "2026-09-26"], ["2026-08-01", "2026-08-26"], ["2026-08-01", "2026-08-31"],
    ]);
  });
  it("handles shorter previous months and year boundaries", () => {
    expect(monthlyVisitorRanges("2024-03-30")[1].endDate).toBe("2024-02-29");
    expect(monthlyVisitorRanges("2026-01-02")[2].startDate).toBe("2025-12-01");
  });
  it("deduplicates each interval and scopes the single query to completed visits in one store", async () => {
    findMany.mockResolvedValue([
      { customerId: "a", bookingDate: date("2026-09-01") },
      { customerId: "a", bookingDate: date("2026-09-20") },
      { customerId: "b", bookingDate: date("2026-08-20") },
      { customerId: "c", bookingDate: date("2026-08-30") },
    ]);
    expect((await getMonthlyVisitorOverview("store-a", "2026-09-26")).map(r => r.count)).toEqual([1, 1, 2]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      storeId: "store-a", bookingStatus: "COMPLETED", bookingDate: { gte: date("2026-08-01"), lte: date("2026-09-26") },
    } }));
  });
  it("keeps true zero counts for empty intervals", async () => {
    findMany.mockResolvedValue([]);
    expect((await getMonthlyVisitorOverview("store-a", "2026-09-26")).map(r => r.count)).toEqual([0, 0, 0]);
  });
});
