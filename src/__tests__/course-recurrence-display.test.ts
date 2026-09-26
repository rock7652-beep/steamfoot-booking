import { describe, expect, it } from "vitest";
import { courseRecurrenceLabels } from "@/lib/course-recurrence-display";

const session = (id: string, requestKey: string, date: string) => ({
  id,
  requestKey,
  startsAt: `${date}T02:00:00.000Z`,
});

describe("course recurrence labels", () => {
  it("separates weekly and alternate week series, including a moved occurrence", () => {
    const labels = courseRecurrenceLabels([
      session("w1", "weekly", "2026-09-07"),
      session("w2", "weekly", "2026-09-14"),
      session("b1", "biweekly", "2026-09-07"),
      session("b2", "biweekly", "2026-09-21"),
      session("m1", "moved", "2026-09-07"),
      session("m2", "moved", "2026-09-16"),
      { ...session("m3", "moved", "2026-09-22"), rescheduledFromStartsAt: "2026-09-21T02:00:00.000Z" },
      { ...session("shift1", "shifted", "2026-09-07"), rescheduledFromStartsAt: "2026-09-07T02:00:00.000Z" },
      { ...session("shift2", "shifted", "2026-09-23"), rescheduledFromStartsAt: "2026-09-21T02:00:00.000Z" },
      session("single", "single", "2026-09-07"),
    ]);
    expect(labels.get("w1")).toBe("每週固定");
    expect(labels.get("w2")).toBe("每週固定");
    expect(labels.get("b1")).toBe("隔週固定");
    expect(labels.get("b2")).toBe("隔週固定");
    expect(labels.has("m1")).toBe(false);
    expect(labels.get("shift2")).toBe("隔週固定");
    expect(labels.has("single")).toBe(false);
  });
});
