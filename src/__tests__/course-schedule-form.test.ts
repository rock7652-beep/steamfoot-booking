import { describe, expect, it } from "vitest";
import { courseScheduleCreatedDates, courseScheduleFormFields } from "@/lib/course-schedule-form";

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
