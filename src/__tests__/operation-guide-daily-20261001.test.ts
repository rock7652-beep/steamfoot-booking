import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { availableGuides, findOperationGuides, operationGuides } from "../lib/operation-guide";
import { coursePortalGuides, findCoursePortalGuides } from "../lib/course-portal-guides";
import type { GuideAccess } from "../lib/operation-guide-types";

const guide = (id: string) => operationGuides.find(item => item.id === id)!;
const course: GuideAccess = {
  module: "course",
  permissions: ["business_hours.manage", "booking.update", "staff.manage", "staff.view"],
  features: { course_waitlist: true },
};
const hq: GuideAccess = { module: "steamfoot", permissions: ["audit.read"], features: {} };

describe("October 1 guide review", () => {
  it("adds waitlist, HQ audit and unified settings guidance", () => {
    expect(operationGuides).toHaveLength(171);
    expect(findOperationGuides("候補 5人 4小時", course).map(item => item.id)).toContain("C158");
    expect(findOperationGuides("同行 立即遞補", course).map(item => item.id)).toContain("C159");
    expect(findOperationGuides("總部 各店 操作人", hq).map(item => item.id)).toContain("I12");
    expect(findOperationGuides("五分類 側邊面板", { module: "spa", permissions: [], features: {} }).map(item => item.id)).toContain("I13");
    expect(findCoursePortalGuides("member", true, "候補 取消候補").map(item => item.id)).toContain("CP19");
    expect(coursePortalGuides).toHaveLength(19);
  });

  it("keeps new articles behind their real module, feature and permissions", () => {
    expect(availableGuides({ ...course, features: {} }).some(item => item.id === "C158")).toBe(false);
    expect(availableGuides({ ...course, permissions: ["booking.update"] }).some(item => item.id === "C158")).toBe(false);
    expect(availableGuides({ ...course, permissions: ["business_hours.manage"] }).some(item => item.id === "C159")).toBe(false);
    expect(availableGuides({ module: "spa", permissions: ["audit.read"], features: {} }).some(item => item.id === "I12")).toBe(true);
    expect(availableGuides({ module: "course", permissions: [], features: {} }).some(item => item.id === "I13")).toBe(false);
  });

  it("updates existing navigation, role and multi-store explanations", () => {
    expect(JSON.stringify(guide("F01"))).toContain("發送紀錄");
    expect(JSON.stringify(guide("I05"))).toContain("母店店主也只能查看");
    expect(guide("I05").modules).toContain("course");
    expect(guide("I06").modules).toContain("course");
    expect(guide("I07").modules).toContain("course");
    expect(JSON.stringify(guide("I11"))).toContain("HQ 集中中心");
    expect(JSON.stringify(guide("C114"))).toContain("舊頁覆蓋新費率");
    expect(JSON.stringify(guide("C123"))).toContain("側邊面板");
    expect(JSON.stringify(guide("C136"))).toContain("最後選");
    expect(JSON.stringify(coursePortalGuides.find(item => item.id === "CP17"))).toContain("每頁最多 50 筆");
    expect(JSON.stringify(coursePortalGuides.find(item => item.id === "CP18"))).not.toContain("歷史付款紀錄");
  });

  it("traces every new backend article to real source files", () => {
    for (const id of ["C158", "C159", "I12", "I13"]) {
      expect(guide(id).verification).toBe("source-reviewed");
      for (const source of guide(id).sources) expect(existsSync(source), `${id}: ${source}`).toBe(true);
    }
  });
});
