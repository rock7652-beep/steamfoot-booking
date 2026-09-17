import { describe, expect, it } from "vitest";
import { filterCourseCustomers, type CourseCustomerListFilterRow } from "@/lib/course-customer-list";

const now = new Date("2026-09-17T01:00:00Z");
const row = (id: string, override: Partial<CourseCustomerListFilterRow> = {}): CourseCustomerListFilterRow => ({
  id, name: id, phone: "0912345678", lineName: null, lineLinkStatus: "UNLINKED",
  customerStage: "LEAD", lastVisitAt: null, createdAt: now, sponsoredCount: 0,
  assignedStaff: null, userStatus: "ACTIVE", ...override,
});
const filter = (rows: CourseCustomerListFilterRow[], query: string, points = new Map<string, number>()) =>
  filterCourseCustomers(rows, new URLSearchParams(query), points, now).map(r => r.id);

describe("course customer filters", () => {
  it("uses Taipei month bounds including the final millisecond", () => {
    expect(filter([
      row("before", { lastVisitAt: new Date("2026-08-31T15:59:59.999Z") }),
      row("first", { lastVisitAt: new Date("2026-08-31T16:00:00Z") }),
      row("last", { lastVisitAt: new Date("2026-09-30T15:59:59.999Z") }),
      row("after", { lastVisitAt: new Date("2026-09-30T16:00:00Z") }),
    ], "visit=month")).toEqual(["last", "first"]);
  });
  it("keeps never attended separate from stale attendance", () => {
    const rows = [row("never"), row("old", { lastVisitAt: new Date("2026-08-01T01:00:00Z") }), row("recent", { lastVisitAt: now })];
    expect(filter(rows, "visit=never")).toEqual(["never"]);
    expect(filter(rows, "visit=stale30")).toEqual(["old"]);
  });
  it("combines LINE name, status, referral and assigned manager filters", () => {
    const match = row("match", { lineName: "Yoga A", lineLinkStatus: "LINKED", sponsoredCount: 2, assignedStaff: { id: "manager" } });
    expect(filter([match, row("other", { lineName: "Yoga A" })], "search=yoga&status=linked&referral=has&staff=manager")).toEqual(["match"]);
  });
  it("sorts only supplied course point availability and keeps suspended accounts last", () => {
    const rows = [row("low"), row("high"), row("disabled", { userStatus: "SUSPENDED" })];
    expect(filter(rows, "sort=points", new Map([["low", 2], ["high", 8], ["disabled", 50]]))).toEqual(["high", "low", "disabled"]);
    expect(rows.map(r => r.id)).toEqual(["low", "high", "disabled"]);
  });
});
