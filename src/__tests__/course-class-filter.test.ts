import { describe, expect, it } from "vitest";
import { courseClassMatches } from "@/lib/course-class-presentation";

describe("fitness class filters", () => {
  const sessions = [
    { id: "group", type: "GROUP" },
    { id: "private", type: "PRIVATE" },
    { id: "self", type: "SELF_ORGANIZED" },
    { id: "trial", type: "GROUP", trial: true },
    { id: "rental", type: "GROUP", rental: true },
    { id: "missing", type: null },
  ];
  it.each([
    ["all", ["group", "private", "self", "trial", "rental", "missing"]],
    ["GROUP", ["group"]], ["PRIVATE", ["private"]],
    ["SELF_ORGANIZED", ["self"]], ["TRIAL", ["trial"]],
    ["RENTAL", ["rental"]], ["unset", ["missing"]],
  ])("%s filters both the timetable and its totals", (filter, expected) => {
    const result = sessions.filter(s => courseClassMatches(filter, s.type, s.trial, s.rental));
    expect(result.map(s => s.id)).toEqual(expected);
  });
  it("rental identity takes precedence over trial and class metadata", () => {
    expect(courseClassMatches("RENTAL", "PRIVATE", true, true)).toBe(true);
    expect(courseClassMatches("TRIAL", "PRIVATE", true, true)).toBe(false);
    expect(courseClassMatches("PRIVATE", "PRIVATE", true, true)).toBe(false);
  });
});
