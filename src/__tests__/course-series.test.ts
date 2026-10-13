import { describe, expect, it } from "vitest";
import { buildNextFixedSeriesOccurrences, findFixedSeriesConflicts, fixedSeriesOccurrenceOnDate } from "@/lib/course-series";

const series = {
  requestKey: "fixed-a",
  roomId: "room-a",
  coachId: "teacher-a",
  startsAt: new Date("2026-10-14T10:00:00.000Z"), // 18:00 Taipei
  endsAt: new Date("2026-10-14T11:00:00.000Z"),
  frequency: "WEEKLY" as const,
  untilDate: null,
  excludedDates: [] as string[],
  cancelledAt: null,
};

describe("fixed course series reservations", () => {
  it("keeps occupying the weekly slot beyond the first 53 materialized sessions", () => {
    const date = "2027-11-03";
    expect(fixedSeriesOccurrenceOnDate(series, date)).not.toBeNull();
    expect(findFixedSeriesConflicts([series], [{ startsAt: new Date("2027-11-03T10:00:00.000Z"), endsAt: new Date("2027-11-03T11:00:00.000Z") }], { roomId: "room-a", coachId: "teacher-b" })).toHaveLength(1);
  });

  it("honors biweekly cadence, one-date cancellations, and an end date", () => {
    const biweekly = { ...series, frequency: "BIWEEKLY" as const, excludedDates: ["2026-10-28"], untilDate: new Date("2026-11-25T00:00:00.000Z") };
    expect(fixedSeriesOccurrenceOnDate(biweekly, "2026-10-28")).toBeNull();
    expect(fixedSeriesOccurrenceOnDate(biweekly, "2026-11-11")).not.toBeNull();
    expect(fixedSeriesOccurrenceOnDate(biweekly, "2026-11-25")).not.toBeNull();
    expect(fixedSeriesOccurrenceOnDate(biweekly, "2026-12-09")).toBeNull();
  });

  it("builds later calendar rows without changing the ongoing reservation rule", () => {
    const next = buildNextFixedSeriesOccurrences(series, "2027-10-13", 2);
    expect(next.map(item => item.startsAt.toISOString())).toEqual([
      "2027-10-20T10:00:00.000Z",
      "2027-10-27T10:00:00.000Z",
    ]);
  });
});
