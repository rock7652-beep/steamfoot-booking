import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/spa-db", () => ({ spaPrisma: {} }));
import { parseTaiwanDateToDbDate } from "@/lib/date-utils";
import { summarizeSpaPeriod } from "@/server/queries/spa-analysis";

const date = parseTaiwanDateToDbDate;
const paid = (day: string) => new Date(`${day}T12:00:00+08:00`);

describe("SPA analysis period", () => {
  const range = { startDate: "2026-08-31", endDate: "2026-09-21" };
  const previous = { startDate: "2026-08-09", endDate: "2026-08-30" };
  const visits = [
    { customerId: "a", bookingDate: date("2026-08-20"), people: 1, isTrial: true },
    { customerId: "a", bookingDate: date("2026-09-01"), people: 1, isTrial: true },
    { customerId: "a", bookingDate: date("2026-09-02"), people: 1, isTrial: false },
    { customerId: "b", bookingDate: date("2026-09-21"), people: 2, isTrial: true },
    { customerId: "c", bookingDate: date("2026-09-22"), people: 1, isTrial: true },
  ];
  const first = new Map([["a", date("2026-08-20")], ["b", date("2026-09-21")]]);

  it("counts SPA attendees, unique people and previous period return separately", () => {
    const result = summarizeSpaPeriod(range, previous, visits, first, [{ customerId: "a", createdAt: paid("2026-09-02") }, { customerId: "b", createdAt: paid("2026-09-22") }]);
    expect(result).toMatchObject({ serviceVisits: 4, visitors: 2, newCustomers: 1, trialVisits: 3, trialCustomers: 2, returned: 1, retentionBase: 1, retentionRate: 100, packageCustomers: 1, converted: 1, conversionRate: 50 });
  });

  it("does not count a renewal or an earlier sale as a new trial conversion", () => {
    const result = summarizeSpaPeriod(range, previous, visits, first, [
      { customerId: "a", createdAt: paid("2026-08-15") },
      { customerId: "a", createdAt: paid("2026-09-02") },
      { customerId: "b", createdAt: paid("2026-09-20") },
    ]);
    expect(result.packageCustomers).toBe(2);
    expect(result.converted).toBe(0);
    expect(result.conversionRate).toBe(0);
  });
});
