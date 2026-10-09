import { describe, expect, it } from "vitest";
import { operationGuides, availableGuides, findOperationGuides } from "../lib/operation-guide";
import { dailyOperationGuides20261009 } from "../lib/operation-guide-daily-20261009";
import { coursePortalGuides, findCoursePortalGuides } from "../lib/course-portal-guides";
import type { GuideAccess } from "../lib/operation-guide-types";

const courseAccess: GuideAccess = {
  module: "course",
  permissions: ["booking.read", "wallet.read", "customer.read", "business_hours.manage", "staff.manage"],
  features: {},
  sharedCardState: "ENABLED"
};

describe("2026-10-09 operation guide inventory", () => {
  it("adds the self-booking switch and HQ intake guides", () => {
    expect(dailyOperationGuides20261009.map(g => g.id)).toEqual(["C168", "I19"]);
    expect(dailyOperationGuides20261009).toEqual([
      expect.objectContaining({ id: "C168", category: "hours", modules: ["course"], permission: "business_hours.manage", verification: "source-reviewed" }),
      expect.objectContaining({ id: "I19", category: "settings", modules: ["steamfoot", "spa", "course"], permission: "staff.manage", verification: "source-reviewed" }),
    ]);
    expect(findOperationGuides("暫停 自動遞補", courseAccess).map(g => g.id)).toContain("C168");
    expect(findOperationGuides("需求諮詢 人工關聯", courseAccess).map(g => g.id)).toContain("I19");
    expect(operationGuides).toHaveLength(203);
  });

  it("adds member guidance without claiming existing records are removed", () => {
    expect(coursePortalGuides.filter(g => g.id === "CP22")).toHaveLength(1);
    const guide = coursePortalGuides.find(g => g.id === "CP22");
    expect(guide?.role).toBe("member");
    expect(JSON.stringify(guide)).toContain("不會刪除或重排候補");
    expect(findCoursePortalGuides("member", true, "暫停 自行預約").map(g => g.id)).toContain("CP22");
    expect(coursePortalGuides).toHaveLength(22);
  });

  it("keeps shared-card guidance aligned with independent feature presentation", () => {
    expect(findCoursePortalGuides("member", true, "共卡", false, "HIDDEN").map(g => g.id)).not.toContain("CP04");
    const locked = findCoursePortalGuides("member", true, "既有授權", false, "LOCKED").find(g => g.id === "CP04");
    expect(locked).toBeDefined();
    expect(locked?.note).toBe("共卡功能未開通，暫不新增成員或同行；既有授權與預約仍可使用、查看及取消。");
    expect(locked?.steps).toContain("選可用方案與實際上課人，僅能勾選既有授權成員。");
    expect(findCoursePortalGuides("member", true, "", true, "LOCKED").map(g => g.id)).not.toContain("CP20");
    expect(findCoursePortalGuides("member", true, "", true, "ENABLED").map(g => g.id)).toContain("CP20");
  });

  it("keeps the added guides within their module and permission boundaries", () => {
    const withoutManage = { ...courseAccess, permissions: ["booking.read", "customer.read"] };
    expect(availableGuides(withoutManage).map(g => g.id)).not.toContain("C168");
    expect(availableGuides(withoutManage).map(g => g.id)).not.toContain("I19");
    for (const industryModule of ["steamfoot", "spa"] as const) {
      expect(availableGuides({ ...courseAccess, module: industryModule }).map(g => g.id)).not.toContain("C168");
    }
    expect(operationGuides.find(g => g.id === "I19")?.important).toContain("限 HQ ADMIN 且需 staff.manage");
    expect(findCoursePortalGuides("coach", true).map(g => g.id)).not.toContain("CP22");
  });

  it("documents roster summary lines and the fourth HQ metric", () => {
    expect(JSON.stringify(coursePortalGuides.find(g => g.id === "CP14"))).toContain("第一行是顧客標籤");
    expect(JSON.stringify(operationGuides.find(g => g.id === "I18"))).toContain("自動提醒");
  });
});
