import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ prisma: {} }));
import { analysisComparisonRanges, previousAnalysisRange, resolveAnalysisRange, isAnalysisDate, parseTaiwanDateToDbDate } from "@/lib/date-utils";
import { selectPeriodFacts } from "@/server/queries/analysis-period";
import { selectConversionCustomerIds } from "@/server/queries/conversion-metrics";

const date = parseTaiwanDateToDbDate;
describe("analysis ranges", () => {
  it("validates real dates and preserves cross-month selections", () => {
    expect(isAnalysisDate("2026-02-30")).toBe(false);
    expect(isAnalysisDate("2024-02-29")).toBe(true);
    expect(resolveAnalysisRange({ startDate: "2026-08-29", endDate: "2026-09-04" })).toEqual({ startDate: "2026-08-29", endDate: "2026-09-04", preset: "custom" });
  });
  it("matches elapsed days for a current week and keeps the complete preceding cohort", () => {
    const ranges = analysisComparisonRanges({ startDate: "2026-09-21", endDate: "2026-09-27" }, "week", "2026-09-26");
    expect(ranges.current.endDate).toBe("2026-09-26");
    expect(ranges.previous).toEqual({ startDate: "2026-09-14", endDate: "2026-09-19" });
    expect(ranges.previousFull.endDate).toBe("2026-09-20");
  });
  it("compares complete months to complete shorter months and custom ranges to equal days", () => {
    expect(previousAnalysisRange({ startDate: "2026-03-01", endDate: "2026-03-31" }, "month")).toEqual({ startDate: "2026-02-01", endDate: "2026-02-28" });
    expect(previousAnalysisRange({ startDate: "2026-01-01", endDate: "2026-01-07" }, "custom")).toEqual({ startDate: "2025-12-25", endDate: "2025-12-31" });
  });
  it("clamps leap-year comparison dates", () => {
    expect(analysisComparisonRanges({ startDate: "2024-02-29", endDate: "2024-02-29" }, "today", "2026-09-26").year).toEqual({ startDate: "2023-02-28", endDate: "2023-02-28" });
  });
});
describe("selected-period facts", () => {
  const range = { startDate: "2026-09-21", endDate: "2026-09-26" };
  const previous = { startDate: "2026-09-14", endDate: "2026-09-20" };
  const visits = [
    { customerId: "a", bookingDate: date("2026-09-22"), bookingType: "FIRST_TRIAL", people: 2, attendedPeople: 2 },
    { customerId: "a", bookingDate: date("2026-09-23"), bookingType: "PACKAGE_SESSION", people: 1 },
    { customerId: "b", bookingDate: date("2026-09-18"), bookingType: "FIRST_TRIAL", people: 1 },
    { customerId: "b", bookingDate: date("2026-09-25"), bookingType: "PACKAGE_SESSION", people: 1 },
    { customerId: "c", bookingDate: date("2026-09-10"), bookingType: "FIRST_TRIAL", people: 1 },
  ];
  const trials = visits.filter(v => v.bookingType === "FIRST_TRIAL");
  const first = new Map([ ["a", date("2026-09-22")], ["b", date("2026-09-18")], ["c", date("2026-09-10")] ]);
  const purchase = (id: string, day: string, status = "ACTIVE") => ({ customerId: id, transactionDate: new Date(`${day}T12:00:00+08:00`), customerPlanWallet: { status } });
  it("separates people, unique customers and groups, excluding the rest of the month", () => {
    const result = selectPeriodFacts(range, previous, visits, first, trials, []);
    expect(result.counts).toMatchObject({ uniqueVisitors: 2, newVisitors: 1, returningVisitors: 1, completedServices: 4, trialAttendees: 2, trialBookingGroups: 1, returnedCustomers: 1, unreturnedCustomers: 0 });
    expect([...result.segments["monthly-customers"]]).toEqual(["a", "b"]);
  });
  it("distinguishes new conversion, tracked conversion and renewal and ignores cancelled wallets", () => {
    const purchases = [purchase("a", "2026-09-22"), purchase("a", "2026-09-24"), purchase("b", "2026-09-25"), purchase("c", "2026-09-24", "CANCELLED")];
    const result = selectPeriodFacts(range, previous, visits, first, trials, purchases);
    expect(result.counts).toMatchObject({ currentTrialConversions: 1, trackedConversions: 1, convertedCustomers: 2, conversionRate: 50, unconvertedCustomers: 1 });
    expect(result.segments["monthly-converted"].size).toBe(result.counts.convertedCustomers);
  });
  it("does not rewrite completed period when purchase happens later", () => {
    const result = selectConversionCustomerIds("2026-09", trials, [purchase("a", "2026-09-27")], range);
    expect(result.convertedCustomerIds.size).toBe(0);
    expect(result.unconvertedCustomerIds.has("a")).toBe(true);
  });
  it("uses Taiwan paid date at midnight and rejects renewal before the selected range", () => {
    const result = selectConversionCustomerIds("2026-09", trials, [purchase("b", "2026-09-20"), purchase("b", "2026-09-25"), { ...purchase("a", "2026-09-22"), paidAt: new Date("2026-09-26T16:00:00Z") }], range);
    expect(result.convertedCustomerIds.size).toBe(0);
  });
});
