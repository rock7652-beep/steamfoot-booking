import { describe, expect, it } from "vitest";
import { promotableWaitlistGroups, waitlistGroups, withinAutoPromoteWindow } from "@/lib/course-waitlist";

const at = (minutes: number) => new Date(Date.UTC(2026, 8, 30, 0, minutes));

describe("course waitlist ordering", () => {
  it("keeps companions in one FIFO group", () => {
    const rows = [
      { id: "a1", groupKey: "a", createdAt: at(1) },
      { id: "a2", groupKey: "a", createdAt: at(1) },
      { id: "b1", groupKey: "b", createdAt: at(2) },
    ];
    expect(waitlistGroups(rows).map(group => group.map(row => row.id))).toEqual([
      ["a1", "a2"],
      ["b1"],
    ]);
  });

  it("does not skip a two-person first group when only one seat opens", () => {
    const rows = [
      { id: "a1", groupKey: "a", createdAt: at(1) },
      { id: "a2", groupKey: "a", createdAt: at(1) },
      { id: "b1", groupKey: "b", createdAt: at(2) },
    ];
    expect(promotableWaitlistGroups(rows, 1)).toEqual([]);
    expect(promotableWaitlistGroups(rows, 2).map(group => group.map(row => row.id))).toEqual([
      ["a1", "a2"],
    ]);
  });

  it("stops automatic promotion inside the configured cutoff", () => {
    const now = new Date("2026-09-30T08:00:00.000Z");
    expect(withinAutoPromoteWindow(new Date("2026-09-30T13:00:00.000Z"), 240, now)).toBe(true);
    expect(withinAutoPromoteWindow(new Date("2026-09-30T11:59:59.000Z"), 240, now)).toBe(false);
  });
});
