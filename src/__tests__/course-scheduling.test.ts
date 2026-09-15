import { describe, expect, it } from "vitest";
import {
  buildCourseOccurrences,
  courseIntervalsOverlap,
} from "@/lib/course-scheduling";
import { toLocalDateStr } from "@/lib/date-utils";

const base = {
  templateId: "yoga",
  roomId: "room",
  coachId: "coach",
  date: "2026-09-22",
  time: "18:00",
  durationMinutes: 60,
  capacity: 10,
  requestKey: "cbd7b9ea-0638-4046-a1b4-11360f2cc955",
};
describe("course scheduling", () => {
  it("uses Taipei time and preserves the selected date", () => {
    const [session] = buildCourseOccurrences(base);
    expect(session.startsAt.toISOString()).toBe("2026-09-22T10:00:00.000Z");
    expect(toLocalDateStr(session.startsAt)).toBe(base.date);
  });
  it("repeats weekly across months through an inclusive end date", () => {
    expect(
      buildCourseOccurrences({ ...base, repeatUntil: "2026-10-06" }).map((s) =>
        toLocalDateStr(s.startsAt),
      ),
    ).toEqual(["2026-09-22", "2026-09-29", "2026-10-06"]);
  });
  it("rejects rolled-over dates, reverse ranges and unbounded batches", () => {
    expect(() =>
      buildCourseOccurrences({ ...base, date: "2026-02-30" }),
    ).toThrow();
    expect(() =>
      buildCourseOccurrences({ ...base, repeatUntil: "2026-09-21" }),
    ).toThrow();
    expect(() =>
      buildCourseOccurrences({ ...base, repeatUntil: "2028-01-01" }),
    ).toThrow();
  });
  it("handles midnight and half-open adjacent courses", () => {
    const [a] = buildCourseOccurrences({ ...base, time: "23:30" });
    const [b] = buildCourseOccurrences({
      ...base,
      date: "2026-09-23",
      time: "00:30",
    });
    const [c] = buildCourseOccurrences({
      ...base,
      date: "2026-09-23",
      time: "00:00",
    });
    expect(toLocalDateStr(a.endsAt)).toBe("2026-09-23");
    expect(courseIntervalsOverlap(a, b)).toBe(false);
    expect(courseIntervalsOverlap(a, c)).toBe(true);
  });
});
