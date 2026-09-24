import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { availableGuides, findOperationGuides, guideCategoryForPath, relatedOperationGuides, operationGuides, guideCategories } from "../lib/operation-guide";
import type { GuideAccess } from "../lib/operation-guide-types";
import { branchConnectionMonthlyFee, managementMonthlyFee } from "../lib/alliance-subscription";
const access: GuideAccess = { module: "steamfoot", permissions: ["booking.read", "booking.update", "customer.read", "business_hours.manage", "business_hours.view"], features: { line_reminder: true } };
describe("guide catalogue", () => {
  it("exposes course basics while gating health and attribution by their own access", () => {
    const permissions = [...new Set(operationGuides.flatMap(g => [g.permission, ...(g.additionalPermissions ?? [])]).filter(Boolean))];
    const features = Object.fromEntries(operationGuides.filter(g => g.feature).map(g => [g.feature!, true]));
    const course: GuideAccess = { module: "course", permissions, features };
    expect(availableGuides(course)).toHaveLength(47);
    expect(availableGuides({...course, features:{}}).some(g => g.id === "C135")).toBe(false);
    expect(availableGuides({...course, permissions:["customer.read"]}).some(g => g.id === "C128")).toBe(false);
    expect(findOperationGuides("量測", course).some(g => g.id === "C135")).toBe(true);
    expect(findOperationGuides("取消截止", course).some(g => g.id === "C132")).toBe(true);
    expect(availableGuides({...course, module:"steamfoot"}).some(g => g.id === "C126")).toBe(false);
    expect(availableGuides({...course, permissions:[], features:{}}).map(g => g.id)).toEqual(expect.arrayContaining(["L01", "L02", "L03"]));
  });
  it("separates course workflows and respects course page modes and refund permissions", () => {
    const course: GuideAccess = {...access, module:"course"};
    expect(availableGuides(course).every(g => g.modules.includes("course"))).toBe(true);
    expect(findOperationGuides("共卡", course).some(g => g.id === "C101")).toBe(true);
    expect(availableGuides(course).some(g => g.id === "A01")).toBe(false);
    expect(availableGuides(course).some(g => g.id === "C105")).toBe(false);
    expect(availableGuides({...course,permissions:["transaction.refund","transaction.read"]}).some(g => g.id === "C105")).toBe(true);
    expect(guideCategoryForPath("/s/test/admin/dashboard/courses?view=customers")).toBe("customers");
    expect(relatedOperationGuides("/dashboard/courses?view=settings",course).map(g=>g.id)).toEqual(["C104","C106","C120","C131","C132"]);
    expect(relatedOperationGuides("/dashboard/courses/reminders",{...course,features:{}})).toEqual([]);
  });
  it("covers the released course setup, scheduling, plans, staff, money and analysis workflows", () => {
    const allCourse: GuideAccess = {
      module: "course",
      permissions: [
        "booking.read", "booking.create", "booking.update", "business_hours.manage",
        "customer.read", "plans.edit", "wallet.read", "wallet.create", "staff.view", "staff.manage",
        "report.read", "trial.confirm", "transaction.read", "transaction.create", "transaction.refund",
        "cashbook.read", "cashbook.create",
      ],
      features: {line_reminder: true, basic_reports: true},
    };
    expect(operationGuides).toHaveLength(129);
    expect(availableGuides(allCourse).map(g => g.id)).toEqual(expect.arrayContaining([
      "C101", "C102", "C103", "C104", "C105", "C106", "C107", "C108", "C109",
      "C110", "C111", "C112", "C113", "C114", "C115", "C116", "C117",
      "C118", "C119", "C120", "C121", "C122", "C123", "C124", "C125",
      "C10", "I08",
    ]));
    expect(findOperationGuides("批次排課 整批", allCourse).some(g => g.id === "C109")).toBe(true);
    expect(findOperationGuides("待核帳 後四碼", allCourse).some(g => g.id === "C113")).toBe(true);
    expect(findOperationGuides("授課資格 我的工作", allCourse).some(g => g.id === "C114")).toBe(true);
    expect(findOperationGuides("收款 出席 分開", allCourse).some(g => g.id === "C116")).toBe(true);
    expect(findOperationGuides("帳號尚未連結", allCourse).some(g => g.id === "C117")).toBe(true);
    expect(availableGuides({...allCourse, permissions: ["wallet.create", "wallet.read"]}).some(g => g.id === "C112")).toBe(false);
    expect(availableGuides({...allCourse, features: {line_reminder: true}}).some(g => g.id === "C115")).toBe(false);
    expect(operationGuides.find(g => g.id === "C112")!.answer).toContain("同時完成發卡、購買與收款登記");
    expect(operationGuides.find(g => g.id === "C116")!.important).toContain("不會自動銀行退刷");
    expect(findOperationGuides("固定期課 未到扣堂", allCourse).some(g => g.id === "C119")).toBe(true);
    expect(findOperationGuides("低額度 到期天數", allCourse).some(g => g.id === "C120")).toBe(true);
    expect(findOperationGuides("未指派方案", allCourse).some(g => g.id === "C121")).toBe(true);
    expect(findOperationGuides("授課費 更正誤登", allCourse).some(g => g.id === "C122")).toBe(true);
    expect(findOperationGuides("轉帳 後四碼", allCourse).some(g => g.id === "C125")).toBe(true);
    expect(availableGuides({...allCourse, permissions:["cashbook.read"]}).some(g => g.id === "C122")).toBe(false);
    expect(availableGuides({...allCourse, permissions:["customer.read"]}).some(g => g.id === "C125")).toBe(true);
    for (const id of ["E08","E09","E10","E11"]) expect(operationGuides.find(g=>g.id===id)!.modules).toContain("course");
  });
  it("documents the current customer search, booking search, linked income, source analytics and device preview", () => {
    const steam: GuideAccess = {
      module: "steamfoot",
      permissions: ["booking.read", "customer.read", "cashbook.create", "report.read"],
      features: { cashbook: true, basic_reports: true },
    };
    expect(findOperationGuides("搜尋本月預約", steam).some(g => g.id === "A11")).toBe(true);
    expect(findOperationGuides("Enter 中文選字", steam).some(g => g.id === "C10")).toBe(true);
    expect(findOperationGuides("關聯顧客 消費紀錄", steam).some(g => g.id === "E12")).toBe(true);
    expect(findOperationGuides("Google 地圖 Instagram 來源", steam).some(g => g.id === "H10")).toBe(true);
    expect(findOperationGuides("裝置預覽 平板", steam).some(g => g.id === "I08")).toBe(true);
    expect(operationGuides.find(g => g.id === "H01")!.details.join(" ")).toContain("上方日期篩選");
    expect(operationGuides.find(g => g.id === "H03")!.important).toContain("不是登入方式");
    expect(operationGuides.find(g => g.id === "E08")!.answer).toContain("關聯顧客");
    expect(operationGuides.find(g => g.id === "C123")!.summary).toContain("置中視窗");
    expect(operationGuides.find(g => g.id === "C115")!.details.join(" ")).toContain("固定近六個月");
    expect(availableGuides({ ...steam, permissions: ["cashbook.create"] }).some(g => g.id === "E12")).toBe(false);
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
  it("separates successful trial booking from LINE notification setup", () => {
    expect(findOperationGuides("通知設定完成", access).some(g => g.id === "F12")).toBe(true);
    expect(findOperationGuides("體驗預約成功", access).some(g => g.id === "F12")).toBe(true);
    expect(availableGuides({...access, module: "spa"}).some(g => g.id === "F12")).toBe(false);
    expect(availableGuides({...access, permissions: []}).some(g => g.id === "F12")).toBe(false);
    expect(availableGuides({...access, features: {}}).some(g => g.id === "F12")).toBe(false);
    const guide = operationGuides.find(g => g.id === "F12")!;
    expect(guide.answer).toContain("通知未完成不代表時段沒有保留");
    expect(guide.details.join(" ")).toContain("不會只憑電話產生可覆蓋綁定的連結");
    expect(operationGuides.find(g => g.id === "F04")!.details.join(" ")).toContain("預約已成功但通知尚未完成");
  });
});
