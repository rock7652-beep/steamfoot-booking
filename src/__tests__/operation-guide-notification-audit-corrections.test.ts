import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { availableGuides, findOperationGuides, operationGuides } from "../lib/operation-guide";
import { managerNotificationPreviewSamples } from "../lib/manager-notification-preview";
import { MANAGER_EVENT_PREFERENCE } from "../lib/manager-notification-preferences";
import type { GuideAccess } from "../lib/operation-guide-types";

const guide = (id: string) => operationGuides.find(item => item.id === id)!;
const steam: GuideAccess = {
  module: "steamfoot",
  permissions: ["business_hours.manage", "booking.read"],
  features: { line_reminder: true },
};
const course: GuideAccess = { ...steam, module: "course" };
const contents = (id: string) => JSON.stringify(guide(id));

describe("merged notification and HQ audit guide corrections", () => {
  it("documents the actual nine and seven fictional manager preview types", () => {
    const standardSamples = managerNotificationPreviewSamples();
    const courseSamples = managerNotificationPreviewSamples(true);
    expect(standardSamples).toHaveLength(9);
    expect(courseSamples).toHaveLength(7);
    for (const sample of standardSamples) expect(contents("F01")).toContain(sample.label);
    for (const sample of courseSamples) expect(contents("C123")).toContain(sample.label);
    expect(contents("F01")).toContain("9 種");
    expect(contents("C123")).toContain("7 種");
    expect(contents("C123")).toContain("不含蒸足新體驗預約與 VIP 續購需求");
    expect(contents("F01")).toContain("真人客服催辦共用「要求真人客服」開關");
  });

  it("keeps sample preview, sending and real LINE acceptance separate", () => {
    for (const id of ["F01", "F03", "C123"]) {
      expect(contents(id)).toContain("查看訊息預覽");
      expect(contents(id)).toContain("通知類型");
      expect(contents(id)).toContain("示範");
      expect(contents(id)).toMatch(/不(?:會)?跳轉/);
      expect(contents(id)).toMatch(/不發 LINE|不發送通知/);
      expect(contents(id)).toContain("真實預約");
    }
    expect(guide("F01").details.join(" ")).toContain("不能以預覽代替送達驗收");
    expect(guide("F03").details.join(" ")).toContain("SPA 預約目前未接此觸發");
    expect(guide("F04").important).toContain("不代表本人已在 LINE 看見或點過連結");
    expect(findOperationGuides("查看訊息預覽 通知類型", steam).map(item => item.id)).toEqual(expect.arrayContaining(["F01", "F03"]));
    expect(findOperationGuides("店長通知 7種", course).map(item => item.id)).toContain("C123");
    expect(availableGuides({ ...steam, features: {} }).some(item => item.id === "F01" || item.id === "F03")).toBe(false);
    expect(availableGuides(course).some(item => item.id === "F01" || item.id === "F03")).toBe(false);
  });

  it("explains saved Flex versus legacy text retries without widening the scope", () => {
    expect(Object.keys(MANAGER_EVENT_PREFERENCE)).toHaveLength(9);
    expect(guide("F04").details.join(" ")).toContain("重試沿用該次已保存的卡片內容");
    expect(guide("F04").details.join(" ")).toContain("仍以原文字重試");
    expect(guide("F04").details.join(" ")).toContain("週報、LINE 綁定回覆與顧客手動訊息不在此範圍");
    expect(guide("F04").details.join(" ")).toContain("原觸發規則不因卡片樣式改變");
    expect(findOperationGuides("Flex 文字 重試", course).map(item => item.id)).toContain("F04");
    for (const id of ["F04", "C123"]) expect(contents(id)).toContain("C167");
    expect(guide("C167").title).toContain("確認會到與續購");
    expect(guide("C167").important).toContain("確認會到不等於已報到");
  });

  it("keeps current HQ-only guidance permission-gated with no new feature flag", () => {
    for (const moduleId of ["steamfoot", "spa", "course"] as const) {
      const hq: GuideAccess = { module: moduleId, permissions: ["audit.read"], features: {} };
      expect(availableGuides(hq).map(item => item.id)).toEqual(expect.arrayContaining(["I11", "I12"]));
      expect(availableGuides({ ...hq, permissions: [] }).some(item => item.id === "I11" || item.id === "I12")).toBe(false);
      expect(findOperationGuides("操作與登入紀錄 查看當次登入", hq).map(item => item.id)).toContain("I12");
    }
    for (const id of ["I11", "I12"]) {
      expect(guide(id).feature).toBeNull();
      expect(contents(id)).toContain("HQ ADMIN");
      expect(contents(id)).not.toMatch(/passkey|Passkey|通行金鑰|店家稽核開關/);
      expect(contents(id)).toContain("未記錄");
    }
  });

  it("cross-references inventory correction rather than editing linked cash entries", () => {
    expect(guide("E08").details.join(" ")).toContain("現金帳不可獨立修改或刪除");
    for (const id of ["O09", "O10"]) {
      expect(guide("E08").details.join(" ")).toContain(id);
      expect(guide(id)).toBeDefined();
    }
    expect(guide("E08").details.join(" ")).toContain("收款更正本身不會退款給顧客");
  });

  it("keeps all seven revised articles source-reviewed and traceable", () => {
    for (const id of ["E08", "F01", "F03", "F04", "C123", "I11", "I12"]) {
      expect(guide(id).verification).toBe("source-reviewed");
      for (const source of guide(id).sources) expect(existsSync(source), `${id}: ${source}`).toBe(true);
    }
  });
});
