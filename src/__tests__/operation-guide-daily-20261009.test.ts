import { describe, expect, it } from "vitest";
import { operationGuides, findOperationGuides } from "../lib/operation-guide";
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
    expect(findOperationGuides("暫停 自動遞補", courseAccess).map(g => g.id)).toContain("C168");
    expect(findOperationGuides("需求諮詢 人工關聯", courseAccess).map(g => g.id)).toContain("I19");
    expect(operationGuides).toHaveLength(203);
  });

  it("adds member guidance without claiming existing records are removed", () => {
    const guide = coursePortalGuides.find(g => g.id === "CP22");
    expect(JSON.stringify(guide)).toContain("不會刪除或重排候補");
    expect(findCoursePortalGuides("member", true, "暫停 自行預約").map(g => g.id)).toContain("CP22");
    expect(coursePortalGuides).toHaveLength(22);
  });

  it("keeps shared-card guidance aligned with independent feature presentation", () => {
    expect(findCoursePortalGuides("member", true, "共卡", false, "HIDDEN").map(g => g.id)).not.toContain("CP04");
    const locked = findCoursePortalGuides("member", true, "既有授權", false, "LOCKED").find(g => g.id === "CP04");
    expect(JSON.stringify(locked)).toContain("不能新增成員或同行");
  });

  it("documents roster summary lines and the fourth HQ metric", () => {
    expect(JSON.stringify(coursePortalGuides.find(g => g.id === "CP14"))).toContain("第一行是顧客標籤");
    expect(JSON.stringify(operationGuides.find(g => g.id === "I18"))).toContain("自動提醒");
  });
});
