import { describe, expect, it } from "vitest";
import { coursePortalGuides, findCoursePortalGuides } from "../lib/course-portal-guides";

describe("course portal guide access and search", () => {
  it("keeps member and coach instructions separate", () => {
    expect(findCoursePortalGuides("member", true)).toHaveLength(11);
    expect(findCoursePortalGuides("coach", true)).toHaveLength(7);
    expect(findCoursePortalGuides("member", true).every(g => g.role === "member")).toBe(true);
    expect(findCoursePortalGuides("coach", true).every(g => g.role === "coach")).toBe(true);
    expect(new Set(coursePortalGuides.map(g => g.id)).size).toBe(coursePortalGuides.length);
  });
  it("hides health instructions when the feature is unavailable", () => {
    expect(findCoursePortalGuides("member", false)).toHaveLength(10);
    expect(findCoursePortalGuides("member", false).some(g => g.healthOnly)).toBe(false);
  });
  it("finds transfer and correction instructions within the active role", () => {
    expect(findCoursePortalGuides("member", true, "後四碼 核帳").map(g => g.id)).toContain("CP06");
    expect(findCoursePortalGuides("coach", true, "誤按").map(g => g.id)).toEqual(["CP13"]);
    expect(findCoursePortalGuides("member", true, "全班出席")).toEqual([]);
    expect(findCoursePortalGuides("coach", true, "不存在的搜尋詞")).toEqual([]);
  });
});
