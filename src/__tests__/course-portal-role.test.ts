import { describe, expect, it } from "vitest";
import { coursePortalRoleCookie, resolveCoursePortalRole } from "@/lib/course-portal-role";

describe("course portal identity preference", () => {
  it("keeps explicit selections for dual-role accounts", () => {
    expect(resolveCoursePortalRole("coach", true, true)).toBe("coach");
    expect(resolveCoursePortalRole("member", true, true)).toBe("member");
  });
  it("ignores a coach preference when the work role is revoked", () => {
    expect(resolveCoursePortalRole("coach", true, false)).toBe("member");
  });
  it("opens work directly for coach-only accounts", () => {
    expect(resolveCoursePortalRole("member", false, true)).toBe("coach");
    expect(resolveCoursePortalRole(undefined, false, true)).toBe("coach");
  });
  it("falls back safely for absent or invalid preferences", () => {
    expect(resolveCoursePortalRole(undefined, true, true)).toBe("member");
    expect(resolveCoursePortalRole("owner", true, true)).toBe("member");
  });
  it("isolates each account and store without ambiguous key joins", () => {
    const key = coursePortalRoleCookie("a", "b");
    expect(key).not.toBe(coursePortalRoleCookie("other", "b"));
    expect(key).not.toBe(coursePortalRoleCookie("a", "other"));
    expect(coursePortalRoleCookie("a:b", "c")).not.toBe(coursePortalRoleCookie("a", "b:c"));
  });
});
