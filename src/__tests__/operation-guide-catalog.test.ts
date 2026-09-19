import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { availableGuides, findOperationGuides, guideCategoryForPath, relatedOperationGuides, operationGuides, guideCategories } from "../lib/operation-guide";
import type { GuideAccess } from "../lib/operation-guide-types";
import { branchConnectionMonthlyFee, managementMonthlyFee } from "../lib/alliance-subscription";
const access: GuideAccess = { module: "steamfoot", permissions: ["booking.read", "booking.update", "customer.read", "business_hours.manage", "business_hours.view"], features: { line_reminder: true } };
describe("guide catalogue", () => {
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
  it("finds identity errors and separates temporary failures from re-registration", () => {
    expect(findOperationGuides("暫時無法使用", access).some(g => g.id === "C07")).toBe(true);
    expect(findOperationGuides("會員資料需要店家協助確認", access).some(g => g.id === "C08")).toBe(true);
    const guide = operationGuides.find(g => g.id === "C07")!;
    expect(guide.details.join(" ")).toContain("不需要重新註冊或解除 LINE 綁定");
  });
  it("keeps transfer-purchase and payment confirmation specific to steamfoot", () => {
    const steam = {...access, permissions: ["customer.read", "transaction.create"]};
    expect(findOperationGuides("後四碼", steam).map(g => g.id)).toEqual(expect.arrayContaining(["D12", "E01"]));
    expect(availableGuides({...steam, module: "spa"}).some(g => ["D12", "E01"].includes(g.id))).toBe(false);
    expect(availableGuides({...steam, permissions: []}).some(g => ["D12", "E01"].includes(g.id))).toBe(false);
    expect(guideCategoryForPath("/s/staging/admin/dashboard/payments")).toBe("money");
    expect(relatedOperationGuides("/dashboard/payments", steam).some(g => g.id === "E01")).toBe(true);
  });
  it("explains pending-payment invitation skips without treating them as paid", () => {
    const care = {...access, permissions: ["business_hours.manage"]};
    expect(findOperationGuides("待核帳", care).map(g => g.id)).toEqual(expect.arrayContaining(["F08", "F11"]));
    expect(findOperationGuides("待核帳", {...care, features: {}}).some(g => ["F08", "F11"].includes(g.id))).toBe(false);
    expect(operationGuides.find(g => g.id === "F08")!.answer).toContain("不代表已付款");
  });
  it("documents actual branch usage with examples matching the pricing function", () => {
    const guide = operationGuides.find(g => g.id === "I07")!;
    expect(guide.details.join(" ")).toContain(`$${branchConnectionMonthlyFee(6)!.toLocaleString("en-US")}`);
    expect(guide.details.join(" ")).toContain(`$${managementMonthlyFee(6)!.toLocaleString("en-US")}`);
    expect(guide.details.join(" ")).toContain(`$${branchConnectionMonthlyFee(3)!.toLocaleString("en-US")}`);
    expect(guide.answer).toContain("不會自動扣款");
    expect(availableGuides({...access, permissions: ["plans.edit"]}).some(g => g.id === "I07")).toBe(true);
    expect(availableGuides(access).some(g => g.id === "I07")).toBe(false);
  });
  it("finds member navigation instructions without bypassing customer permissions", () => {
    for (const industry of ["steamfoot", "spa"] as const) {
      const scoped = {...access, module: industry};
      expect(findOperationGuides("底部導覽", scoped).some(g => g.id === "C09")).toBe(true);
      expect(findOperationGuides("立即預約", scoped).some(g => g.id === "C09")).toBe(true);
      expect(availableGuides({...scoped, permissions: []}).some(g => g.id === "C09")).toBe(false);
    }
    const guide = operationGuides.find(g => g.id === "C09")!;
    expect(guide.feature).toBe(null);
    expect(guide.details.join(" ")).toContain("不會一律顯示相同導覽");
    expect(guide.important).toContain("不表示已完成預約");
  });
  it("explains collapsed historical plans without changing entitlement rules", () => {
    expect(findOperationGuides("歷史方案", access).some(g => g.id === "C07")).toBe(true);
    const guide = operationGuides.find(g => g.id === "C07")!;
    expect(guide.details.join(" ")).toContain("不會恢復效期、增加堂數");
    const source = readFileSync("src/app/(liff)/liff/wallets/wallets-list.tsx", "utf8");
    expect(source).toContain("dim collapsible count={expired.length}");
    expect(source).toContain("dim collapsible count={history.length}");
    expect(source).not.toMatch(/<details[^>]*\bopen(?:[\s=>])/);
  });
  it("keeps health comparison guidance gated and separates dates from conclusions", () => {
    const health = {...access, features: {ai_health_summary: true}};
    expect(findOperationGuides("最近健康變化", health).some(g => g.id === "M01")).toBe(true);
    expect(findOperationGuides("最近健康變化", access).some(g => g.id === "M01")).toBe(false);
    const guide = operationGuides.find(g => g.id === "M01")!;
    expect(guide.details.join(" ")).toContain("前後兩次量測日期");
    expect(guide.details.join(" ")).toContain("不把單一差值當作");
  });
});
