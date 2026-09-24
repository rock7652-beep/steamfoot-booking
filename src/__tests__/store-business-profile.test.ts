import { readFileSync } from "node:fs";
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


it("keeps music-specific HQ and schedule wording behind the MUSIC business profile", () => {
  const hqDetail = readFileSync("src/app/hq/dashboard/stores/[storeId]/page.tsx", "utf8");
  const onboarding = readFileSync("src/server/actions/store-onboarding.ts", "utf8");
  const workspace = readFileSync("src/app/(dashboard)/dashboard/courses/workspace.tsx", "utf8");
  const board = readFileSync("src/app/(dashboard)/dashboard/courses/course-schedule-board.tsx", "utf8");

  expect(hqDetail).toContain("音樂教室測試店已建置，30 天尚未起算");
  expect(onboarding).toContain("音樂教室使用老師／教室排課，不建立蒸足固定時段");
  expect(workspace).toContain('businessProfile === "MUSIC" ? "音樂課表" : "課表排程"');
  expect(board).toContain('businessProfile === "MUSIC" ? "老師視角" : "教練視角"');
  expect(board).toContain('businessProfile === "MUSIC" ? "一對一" : "私教"');
});


it("defaults music stores to the daily high-density board", () => {
  const workspace = readFileSync("src/app/(dashboard)/dashboard/courses/workspace.tsx", "utf8");
  const board = readFileSync("src/app/(dashboard)/dashboard/courses/course-schedule-board.tsx", "utf8");

  expect(workspace).toContain('businessProfile === "MUSIC"');
  expect(workspace).toContain('? "day"');
  expect(board).toContain('const musicDense = businessProfile === "MUSIC"');
  expect(board).toContain('64 + resourceCount * 132');
  expect(board).toContain('dense={musicDense}');
  expect(board).toContain('resourceView={resourceView}');
});
