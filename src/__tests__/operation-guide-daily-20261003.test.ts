import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { availableGuides, findOperationGuides, operationGuides } from "../lib/operation-guide";
import { coursePortalGuides, findCoursePortalGuides } from "../lib/course-portal-guides";
import type { GuideAccess } from "../lib/operation-guide-types";

const guide = (id: string) => operationGuides.find(item => item.id === id)!;
const course: GuideAccess = { module: "course", permissions: ["booking.read", "booking.create", "booking.update", "customer.read", "customer.update", "staff.view", "staff.manage", "business_hours.manage"], features: { customer_labels: true, line_reminder: true } };
const hq: GuideAccess = { module: "steamfoot", permissions: ["staff.manage"], features: {} };

describe("October 3 guide review", () => {
  it("adds course operations and HQ entitlement guidance", () => {
    expect(operationGuides).toHaveLength(199);
    expect(findOperationGuides("標籤 八字 篩選", course).map(item => item.id)).toContain("C160");
    expect(findOperationGuides("租借 30分鐘 取消", course).map(item => item.id)).toContain("C161");
    expect(findOperationGuides("教師 缺席 返還", course).map(item => item.id)).toContain("C162");
    expect(findOperationGuides("21:00 明日摘要", course).map(item => item.id)).toContain("C164");
    expect(findOperationGuides("隱藏 鎖定 跟隨方案", hq).map(item => item.id)).toContain("I14");
    expect(findOperationGuides("體驗版申請 通知重試", hq).map(item => item.id)).toContain("I15");
  });
  it("keeps feature and permission boundaries visible", () => {
    expect(availableGuides({ ...course, features: {} }).some(item => item.id === "C160")).toBe(false);
    expect(availableGuides({ ...course, permissions: ["customer.read"] }).some(item => item.id === "C160")).toBe(false);
    expect(availableGuides({ ...course, permissions: ["booking.read"] }).some(item => item.id === "C161")).toBe(false);
    expect(availableGuides({ module: "spa", permissions: [], features: {} }).some(item => item.id === "I14")).toBe(false);
    expect(availableGuides(hq).some(item => item.id === "I15")).toBe(true);
  });
  it("updates rental, setup, attendance, identity and pricing explanations", () => {
    expect(JSON.stringify(guide("C108"))).toContain("每小時租金");
    expect(JSON.stringify(guide("C110"))).toContain("可授課時段");
    expect(JSON.stringify(guide("C123"))).toContain("四步設定進度");
    expect(JSON.stringify(guide("C127"))).toContain("保留原分頁");
    expect(JSON.stringify(guide("C128"))).toContain("所屬教練");
    expect(JSON.stringify(guide("C146"))).toContain("不會重新扣回");
    expect(JSON.stringify(guide("I07"))).toContain("首間免費");
    expect(JSON.stringify(coursePortalGuides.find(item => item.id === "CP10"))).toContain("指定日期");
    expect(JSON.stringify(coursePortalGuides.find(item => item.id === "CP12"))).toContain("開課前也可點名");
    expect(findCoursePortalGuides("coach", true, "開課前 點名").map(item => item.id)).toContain("CP12");
  });
  it("traces new backend articles to real source files", () => {
    for (const id of ["C160", "C161", "C162", "C163", "C164", "C165", "I14", "I15"]) {
      expect(guide(id).verification).toBe("source-reviewed");
      for (const source of guide(id).sources) expect(existsSync(source), `${id}: ${source}`).toBe(true);
    }
  });
});
