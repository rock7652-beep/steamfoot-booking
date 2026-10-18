import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findOperationGuides, operationGuides, guideCategories } from "../lib/operation-guide";
import type { GuideAccess } from "../lib/operation-guide-types";

const permissions = [...new Set(operationGuides.flatMap(g => [g.permission, ...(g.additionalPermissions ?? [])]).filter(Boolean))];
const features = Object.fromEntries(operationGuides.filter(g => g.feature).map(g => [g.feature!, true]));
const access: GuideAccess = { module: "steamfoot", permissions, features };
const text = (id: string) => JSON.stringify(operationGuides.find(g => g.id === id));

describe("2026-10-18 backend guide review", () => {
  it("separates staff login approval from notification confirmation and actual login", () => {
    for (const id of ["C07", "C08", "F04"]) {
      expect(text(id)).toContain("允許重新登入");
      expect(text(id)).toContain("確認通知連結");
      expect(findOperationGuides("允許重新登入", access).map(g => g.id)).toContain(id);
    }
    expect(text("C07")).toContain("具顧客修改權限者");
    expect(text("C07")).toContain("也不是已成功登入證明");
    expect(text("C08")).toContain("確認其中一種不代表另一種完成");
    expect(text("F04")).toContain("不能把登入申請當成有效通知收件連結");
    expect(findOperationGuides("允許重新登入", { ...access, module: "spa" })).toEqual([]);
  });
  it("explains background refresh without repeating successful business writes", () => {
    expect(text("C109")).toContain("每 60 秒背景更新");
    expect(text("C109")).toContain("會暫停父課表更新");
    expect(text("C103")).toContain("不再點一次出席或更正來刷新畫面");
    expect(text("C105")).toContain("不重做退款或另補負數交易");
    expect(text("C112")).toContain("不會把已成功結帳變成失敗");
    expect(findOperationGuides("課表更新", { ...access, module: "course" }).map(g => g.id)).toContain("C109");
    expect(findOperationGuides("交易更新", { ...access, module: "course" }).map(g => g.id)).toEqual(expect.arrayContaining(["C105", "C112"]));
  });
  it("records the current main without treating inherited evidence as guide acceptance", () => {
    const state = JSON.parse(readFileSync("docs/operation-guide-audit-state.json", "utf8"));
    expect(state.auditDateTaipei).toBe("2026-10-18");
    expect(state.lastInventoriedMainCommit).toBe("e115fd315fb8bb4fbc10950958a67fa71f658476");
    expect(state.reviewedMainCommitCount).toBe(3);
    expect(state.newGuideIds).toEqual([]);
    expect(state.updatedGuideIds).toEqual(["C07", "C08", "F04", "C103", "C105", "C109", "C112"]);
    expect(state.cumulativeDraftNewGuideIds).toHaveLength(3);
    expect(state.cumulativeDraftUpdatedGuideIds).toHaveLength(56);
    expect(state.backendInteractionPendingCount).toBe(60);
    expect(state.authenticatedAcceptance.guideIdsCleared).toEqual([]);
    expect(state.frontendInteractionPendingGuideIds).toEqual([]);
    expect(operationGuides).toHaveLength(187);
    expect(guideCategories).toHaveLength(15);
  });
});
