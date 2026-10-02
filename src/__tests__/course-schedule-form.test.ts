import { describe, expect, it } from "vitest";
import { courseScheduleCreatedDates, courseScheduleFormFields, courseWeeklyDates } from "@/lib/course-schedule-form";

const defaults = { templateId: "yoga", requestKey: "cbd7b9ea-0638-4046-a1b4-11360f2cc955" };
function fields(mode: string) {
  const data = new FormData();
  Object.entries({ repeatMode: mode, date: "2026-10-01", time: "09:00", roomId: "room", coachId: "coach", duration: "60", capacity: "10" }).forEach(([key, value]) => data.set(key, value));
  return data;
}

describe("schedule form and confirmation dates", () => {
  it("uses the selected weekly mode for submission and includes its final date", () => {
    const data = fields("weekly");
    data.set("until", "2026-10-15");
    data.append("additionalDates", "2026-10-02");
    expect(courseScheduleFormFields(data, defaults).additionalDates).toBeUndefined();
    expect(courseScheduleCreatedDates(data, defaults)).toEqual(["2026-10-01", "2026-10-08", "2026-10-15"]);
  });
  it("confirms the chosen weekly weekdays across months", () => {
    const data = fields("weekly");
    data.set("until", "2026-11-02");
    data.append("weekday", "1");
    data.append("weekday", "4");
    expect(courseScheduleCreatedDates(data, defaults)).toEqual(["2026-10-01", "2026-10-05", "2026-10-08", "2026-10-12", "2026-10-15", "2026-10-19", "2026-10-22", "2026-10-26", "2026-10-29", "2026-11-02"]);
  });
  it("confirms every selected date in order without duplicate starting dates or old weekly fields", () => {
    const data = fields("dates");
    ["2026-11-01", "2026-10-03", "2026-10-01", "2026-10-03"].forEach(date => data.append("additionalDates", date));
    data.set("until", "2026-10-15");
    data.append("weekday", "4");
    const payload = courseScheduleFormFields(data, defaults);
    expect(payload.repeatUntil).toBeUndefined();
    expect(payload.weekdays).toBeUndefined();
    expect(courseScheduleCreatedDates(data, defaults)).toEqual(["2026-10-01", "2026-10-03", "2026-11-01"]);
  });
  it("switches back to a single course without carrying over other dates", () => {
    const data = fields("once");
    data.set("until", "2026-10-15");
    data.append("additionalDates", "2026-10-03");
    expect(courseScheduleCreatedDates(data, defaults)).toEqual(["2026-10-01"]);
  });
});

it("counts the starting course as week one and crosses months and years", () => {
  expect(courseWeeklyDates("2026-10-03", 1)).toEqual(["2026-10-03"]);
  expect(courseWeeklyDates("2026-10-03", 5)).toEqual(["2026-10-03", "2026-10-10", "2026-10-17", "2026-10-24", "2026-10-31"]);
  expect(courseWeeklyDates("2026-12-26", 3)).toEqual(["2026-12-26", "2027-01-02", "2027-01-09"]);
  expect(courseWeeklyDates("2028-02-29", 2)).toEqual(["2028-02-29", "2028-03-07"]);
});
it("repeats each additional weekday for the entered number of weeks", () => {
  expect(courseWeeklyDates("2026-10-03", 2, [2, 6, 2])).toEqual(["2026-10-03", "2026-10-06", "2026-10-10", "2026-10-13"]);
  const data = fields("weekly");
  data.set("repeatWeeks", "2");
  data.append("weekday", "1");
  expect(courseScheduleCreatedDates(data, defaults)).toEqual(["2026-10-01", "2026-10-05", "2026-10-08", "2026-10-12"]);
});
it("rejects invalid week counts and batches exceeding 53 courses", () => {
  for (const weeks of [0, -1, 1.5, 54, NaN]) expect(() => courseWeeklyDates("2026-10-03", weeks)).toThrow();
  expect(courseWeeklyDates("2026-10-03", 53)).toHaveLength(53);
  expect(() => courseWeeklyDates("2026-10-03", 27, [2])).toThrow("53 堂");
});
