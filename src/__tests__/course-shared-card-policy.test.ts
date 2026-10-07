import { describe, expect, it } from "vitest";
import { resolveCourseSharedCardState, type CourseSharedCardSnapshot } from "@/lib/course-shared-card-policy";
import { FEATURES, hasFeature } from "@/lib/feature-flags";

const now = new Date("2026-10-07T10:00:00Z");
const legacy: CourseSharedCardSnapshot = { industryModule: "COURSE", music: false, entitlement: null };

describe("sports shared-card compatibility and shutdown", () => {
  it("requires a persisted store grant, independent of mutable plan settings", () => {
    expect(resolveCourseSharedCardState(legacy, now)).toBe("HIDDEN");
    expect(resolveCourseSharedCardState(null, now)).toBe("HIDDEN");
  });
  it.each(["STEAMFOOT", "SPA", "INVALID"])("never enables unsupported %s even with an explicit grant", industryModule => {
    expect(resolveCourseSharedCardState({ ...legacy, industryModule, entitlement: { status: "ENABLED", startsAt: null, expiresAt: null } }, now)).toBe("HIDDEN");
  });
  it("does not activate music sharing through the new sports feature", () => {
    expect(resolveCourseSharedCardState({ ...legacy, music: true, entitlement: { status: "ENABLED", startsAt: null, expiresAt: null } }, now)).toBe("HIDDEN");
  });
  it.each(["ENABLED", "LOCKED", "HIDDEN", "DISABLED"] as const)("explicit %s controls new sharing", status => {
    expect(resolveCourseSharedCardState({ ...legacy, entitlement: { status, startsAt: null, expiresAt: null } }, now)).toBe(status === "DISABLED" ? "LOCKED" : status);
  });
  it.each([
    { startsAt: new Date("2027-01-01"), expiresAt: null },
    { startsAt: null, expiresAt: new Date("2026-01-01") },
  ])("a dated control cannot fall back to existing plans", dates => {
    expect(resolveCourseSharedCardState({ ...legacy, entitlement: { status: "ENABLED", ...dates } }, now)).toBe("LOCKED");
    expect(resolveCourseSharedCardState({ ...legacy, entitlement: { status: "HIDDEN", ...dates } }, now)).toBe("HIDDEN");
  });
  it("honors inclusive date boundaries and explicit removal returns to the closed default", () => {
    expect(resolveCourseSharedCardState({ ...legacy, entitlement: { status: "ENABLED", startsAt: now, expiresAt: now } }, now)).toBe("ENABLED");
    expect(resolveCourseSharedCardState(legacy, now)).toBe("HIDDEN");
  });
  it.each(["EXPERIENCE", "BASIC", "GROWTH", "ALLIANCE"] as const)("%s cannot auto-grant the independent control", plan => {
    expect(hasFeature(plan, FEATURES.SHARED_CARD)).toBe(false);
  });
});
