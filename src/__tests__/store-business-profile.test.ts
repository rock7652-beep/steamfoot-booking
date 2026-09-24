import { describe, expect, it } from "vitest";
import {
  getBusinessProfileFeatureKey,
  getStoreBusinessLabel,
  resolveCourseBusinessProfile,
} from "@/lib/store-business-profile";

describe("store business profiles", () => {
  it("keeps legacy COURSE stores as fitness by default", () => {
    expect(resolveCourseBusinessProfile([])).toBe("FITNESS");
    expect(getStoreBusinessLabel("COURSE", [])).toBe("運動教室");
  });

  it("identifies music without creating a fourth booking engine", () => {
    expect(getBusinessProfileFeatureKey("MUSIC")).toBe("business.music");
    expect(resolveCourseBusinessProfile(["business.music"])).toBe("MUSIC");
    expect(getStoreBusinessLabel("COURSE", ["business.music"])).toBe("音樂教室");
  });

  it("keeps non-course labels independent from course business profiles", () => {
    expect(getStoreBusinessLabel("STEAMFOOT", ["business.music"])).toBe("蒸足門市");
    expect(getStoreBusinessLabel("SPA", ["business.music"])).toBe("SPA／美容美體");
  });
});
