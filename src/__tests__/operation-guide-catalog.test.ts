import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { availableGuides, findOperationGuides, guideCategoryForPath, relatedOperationGuides, operationGuides, guideCategories } from "../lib/operation-guide";
import type { GuideAccess } from "../lib/operation-guide-types";
const access: GuideAccess = { module: "steamfoot", permissions: ["booking.read", "booking.update", "customer.read", "business_hours.manage", "business_hours.view"], features: { line_reminder: true } };
describe("guide catalogue", () => {
  it("separates course workflows and respects course page modes and refund permissions", () => {
    const course: GuideAccess = {...access, module:"course"};
    expect(availableGuides(course).every(g => g.modules.includes("course"))).toBe(true);
    expect(findOperationGuides("共卡", course).some(g => g.id === "C101")).toBe(true);
    expect(availableGuides(course).some(g => g.id === "A01")).toBe(false);
    expect(availableGuides(course).some(g => g.id === "C105")).toBe(false);
    expect(availableGuides({...course,permissions:["transaction.refund","transaction.read"]}).some(g => g.id === "C105")).toBe(true);
    expect(guideCategoryForPath("/s/test/admin/dashboard/courses?view=customers")).toBe("customers");
    expect(relatedOperationGuides("/dashboard/courses?view=settings",course).map(g=>g.id)).toEqual(["C104","C106"]);
    expect(relatedOperationGuides("/dashboard/courses/reminders",{...course,features:{}})).toEqual([]);
  });
  it("has unique articles with traceable source files and complete instructions", () => {
    expect(new Set(operationGuides.map(g => g.id)).size).toBe(operationGuides.length);
    for (const g of operationGuides) {
      expect(guideCategories.some(c => c.id === g.category)).toBe(true);
      expect(g.steps.length).toBeGreaterThan(0);
      expect(g.answer.trim().length).toBeGreaterThan(0);
      expect(["howto", "explanation", "troubleshooting"]).toContain(g.kind);
      for (const source of g.sources) expect(existsSync(source), `${g.id}: ${source}`).toBe(true);
    }
  });
  it("searches across categories and does not confuse note reminders with LINE settings", () => {
    expect(findOperationGuides("LINE 提醒", access).some(g => g.id === "F01")).toBe(true);
    expect(findOperationGuides("LINE 提醒", access).some(g => g.id === "A03")).toBe(false);
    expect(findOperationGuides("到期日", access).some(g => g.id === "B10")).toBe(true);
  });
  it("filters by permission, module and enabled feature, including direct article visibility", () => {
    expect(availableGuides(access).some(g => g.id === "M01")).toBe(false);
    expect(availableGuides(access).some(g => g.id === "D04")).toBe(false);
    expect(availableGuides(access).some(g => g.id === "J04")).toBe(false);
    expect(availableGuides({...access, module: "spa"}).some(g => g.id === "A01")).toBe(false);
    expect(availableGuides({...access, module: "spa"}).some(g => g.id === "J04")).toBe(true);
  });
  it("recommends relevant settings across categories without bypassing access", () => {
    const results = relatedOperationGuides("/s/staging/admin/dashboard/settings", access);
    expect(results.some(g => g.id === "B01")).toBe(true);
    expect(results.some(g => g.id === "F01")).toBe(true);
    expect(results.every(g => availableGuides(access).includes(g))).toBe(true);
    expect(relatedOperationGuides("/dashboard/settings", {...access, permissions: [], features: {}}).every(g => !g.permission && !g.feature)).toBe(true);
  });
  it("requires both booking and payment permissions for SPA checkout instructions", () => {
    const spa: GuideAccess = {module: "spa", permissions: ["booking.update"], features: {}};
    expect(availableGuides(spa).some(g => g.id === "J11")).toBe(false);
    expect(availableGuides({...spa, permissions: [...spa.permissions, "transaction.create"]}).some(g => g.id === "J11")).toBe(true);
    expect(findOperationGuides("第一階段", {...access, permissions: ["business_hours.manage"]}).some(g => g.id === "F08")).toBe(true);
  });
  it("uses the current page rather than showing booking questions everywhere", () => {
    expect(guideCategoryForPath("/s/staging/admin/dashboard")).toBe("start");
    expect(guideCategoryForPath("/dashboard/settings/hours")).toBe("hours");
    expect(guideCategoryForPath("/dashboard/customers/a/health")).toBe("health");
    expect(guideCategoryForPath("/dashboard/settings/digital-butler")).toBe("digital");
    expect(guideCategoryForPath("/dashboard/not-yet-documented")).toBe(null);
  });
});
