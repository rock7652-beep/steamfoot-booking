import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { availableGuides, findOperationGuides, guideCategoryForPath, operationGuides, guideCategories } from "../lib/operation-guide";
import type { GuideAccess } from "../lib/operation-guide-types";
const access: GuideAccess = { module: "steamfoot", permissions: ["booking.read", "booking.update", "customer.read", "business_hours.manage", "business_hours.view"], features: { line_reminder: true } };
describe("guide catalogue", () => {
  it("has unique articles with traceable source files and complete instructions", () => {
    expect(new Set(operationGuides.map(g => g.id)).size).toBe(operationGuides.length);
    for (const g of operationGuides) {
      expect(guideCategories.some(c => c.id === g.category)).toBe(true);
      expect(g.steps.length).toBeGreaterThanOrEqual(3);
      expect(g.important.length).toBeGreaterThan(0);
      expect(g.success.length).toBeGreaterThan(0);
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
  it("uses the current page rather than showing booking questions everywhere", () => {
    expect(guideCategoryForPath("/s/staging/admin/dashboard")).toBe("start");
    expect(guideCategoryForPath("/dashboard/settings/hours")).toBe("hours");
    expect(guideCategoryForPath("/dashboard/customers/a/health")).toBe("health");
    expect(guideCategoryForPath("/dashboard/settings/digital-butler")).toBe("digital");
    expect(guideCategoryForPath("/dashboard/not-yet-documented")).toBe(null);
  });
});
