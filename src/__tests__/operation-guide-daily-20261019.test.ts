import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { availableGuides, findOperationGuides, operationGuides, guideCategories } from "../lib/operation-guide";
import type { GuideAccess } from "../lib/operation-guide-types";
const permissions = [...new Set(operationGuides.flatMap(g => [g.permission, ...(g.additionalPermissions ?? [])]).filter(Boolean))];
const features = Object.fromEntries(operationGuides.filter(g => g.feature).map(g => [g.feature!, true]));
const access: GuideAccess = { module: "course", permissions, features };
const text = (id: string) => JSON.stringify(operationGuides.find(g => g.id === id));
describe("2026-10-19 backend guide audit", () => {
  it("documents conditional sports rollout without implying production activation", () => {
    for (const id of ["C171", "C172", "C173"]) {
      expect(text(id)).toContain("啟用");
      expect(findOperationGuides("新版運動", access).map(g => g.id)).toContain(id);
      expect(availableGuides({...access, permissions: ["booking.read"]}).some(g => g.id === id)).toBe(id === "C171");
      expect(findOperationGuides("新版運動", {...access, module: "steamfoot"}).some(g => g.id === id)).toBe(false);
    }
    expect(text("C171")).toContain("不代表正式站已上線");
    expect(text("C171")).toContain("超過 500 筆會明確拒絕載入");
    expect(text("C172")).toContain("價格與時間不回算歷史課次");
    expect(text("C172")).toContain("既有方案（保留原規則）");
    expect(text("C173")).toContain("開放選課不自動加人");
    expect(text("C173")).toContain("容量、權益或撞期不符時拒絕本次建立");
    expect(text("C109")).toContain("舊課表");
    expect(text("C110")).toContain("不能再建立重複固定系列");
  });
  it("separates pending review, until-used verified login, revocation and actual login", () => {
    expect(text("C07")).toContain("24 小時");
    expect(text("C07")).toContain("登入前持續有效");
    expect(text("C07")).toContain("也不是已成功登入證明");
    expect(text("C08")).toContain("具重新綁定權限者");
    expect(text("C08")).toContain("撤銷登入授權");
    expect(text("F04")).toContain("不因等待天數失效");
    expect(text("F04")).not.toContain("登入恢復申請或授權逾時時");
    expect(findOperationGuides("登入前持續有效", {...access, module: "steamfoot"}).map(g => g.id)).toEqual(expect.arrayContaining(["C07", "C08", "F04"]));
  });
  it("persists the exact main and only backend pending topics", () => {
    const s = JSON.parse(readFileSync("docs/operation-guide-audit-state.json", "utf8"));
    expect(s.previousCompleteAudit.dateTaipei).toBe("2026-10-20");
    expect(s.previousCompleteAudit.mainCommit).toBe("8d717d5dc45da6fbd4e2984afea48165140281b3");
    expect(s.previousCompleteAudit.newGuideIds).toEqual(["C174", "C175", "C176"]);
    expect(s.previousCompleteAudit.updatedGuideIds).toHaveLength(14);
    expect(s.cumulativeDraftNewGuideIds).toHaveLength(14);
    expect(s.cumulativeDraftUpdatedGuideIds).toHaveLength(74);
    expect(s.backendInteractionPendingCount).toBe(93);
    expect(s.frontendInteractionPendingGuideIds).toEqual([]);
    expect(s.authenticatedAcceptance.guideIdsCleared).toEqual([]);
    expect(operationGuides).toHaveLength(202);
    expect(guideCategories).toHaveLength(15);
  });
});
