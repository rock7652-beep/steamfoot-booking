import { describe, expect, it } from "vitest";
import {
  courseDate,
  courseMemberMarkers,
  courseMonthDays,
  coursePeople,
} from "@/lib/course-calendar";

describe("course portal calendar", () => {
  it("uses Taipei dates across the UTC midnight boundary", () => {
    expect(courseDate("2026-09-30T16:00:00Z")).toBe("2026-10-01");
    expect(courseDate("2026-09-30T15:59:59Z")).toBe("2026-09-30");
  });
  it("shows B as shared for A and self for B even when A booked", () => {
    const bookings = [{ customerId: "B", status: "RESERVED" }];
    expect(courseMemberMarkers(bookings, "A")).toEqual({
      self: false,
      shared: true,
    });
    expect(courseMemberMarkers(bookings, "B")).toEqual({
      self: true,
      shared: false,
    });
    expect(
      courseMemberMarkers(
        [...bookings, { customerId: "A", status: "RESERVED" }],
        "A",
      ),
    ).toEqual({ self: true, shared: true });
  });
  it("removes canceled or no-show markers while preserving completed history", () => {
    expect(
      courseMemberMarkers(
        [
          { customerId: "A", status: "CANCELLED" },
          { customerId: "B", status: "NO_SHOW" },
        ],
        "A",
      ),
    ).toEqual({ self: false, shared: false });
    expect(
      courseMemberMarkers([{ customerId: "A", status: "ATTENDED" }], "A").self,
    ).toBe(true);
  });
  it("counts distinct learners separately from cross-class person-visits", () => {
    expect(
      coursePeople([
        { customerId: "B", status: "RESERVED" },
        { customerId: "B", status: "ATTENDED" },
        { customerId: "A", status: "NO_SHOW" },
        { customerId: "C", status: "CANCELLED" },
      ]),
    ).toEqual({ people: 2, visits: 3 });
  });
  it("includes every date and correct weekday padding for leap and year boundaries", () => {
    expect(courseMonthDays("2028-02").dates).toHaveLength(29);
    expect(courseMonthDays("2026-09").offset).toBe(2);
    expect(courseMonthDays("2027-01").dates.at(-1)).toBe("2027-01-31");
  });
});
