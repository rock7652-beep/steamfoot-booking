import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { availableGuides, findOperationGuides, guideCategories, operationGuides } from "../lib/operation-guide";
import type { GuideAccess } from "../lib/operation-guide-types";

const permissions = [...new Set(operationGuides.flatMap(g => [g.permission, ...(g.additionalPermissions ?? [])]).filter(Boolean))];
const features = Object.fromEntries(operationGuides.filter(g => g.feature).map(g => [g.feature!, true]));
const access: GuideAccess = { module: "course", permissions, features };
const text = (id: string) => JSON.stringify(operationGuides.find(g => g.id === id));

describe("2026-10-20 backend incremental inventory", () => {
  it("separates permanent attendance, correction and unconnected makeup UI", () => {
    expect(text("C174")).toContain("出席狀況");
    expect(text("C174")).toContain("尚未扣堂");
    expect(text("C174")).toContain("補課券已使用或預約");
    expect(text("C174")).toContain("尚未接入可見入口");
    expect(text("C103")).toContain("不是一般 7 日補課券");
    expect(text("C134")).toContain("不預留課卡額度");
  });
  it("documents committed moves and captured compensation without replaying transactions", () => {
    expect(text("C175")).toContain("核對貼上結果");
    expect(text("C175")).toContain("剪下本身不會移動");
    expect(text("C175")).toContain("有效體驗收款");
    expect(text("C176")).toContain("每小時");
    expect(text("C176")).toContain("原購買價格");
    expect(text("C176")).toContain("不重算舊課快照");
    for (const id of ["C174", "C175", "C176"]) {
      expect(findOperationGuides(id, access).map(g => g.id)).toContain(id);
      expect(availableGuides({...access, permissions: ["booking.read"]}).some(g => g.id === id)).toBe(false);
      expect(availableGuides({...access, module: "steamfoot"}).some(g => g.id === id)).toBe(false);
    }
    expect(availableGuides({...access, permissions: ["booking.read"]}).some(g => g.id === "C171")).toBe(true);
    expect(findOperationGuides("核對貼上結果", access).map(g => g.id)).toContain("C175");
    expect(findOperationGuides("固定鐘點", access).map(g => g.id)).toContain("C176");
  });
  it("clarifies read limits, precise rental, compact history and protected previews", () => {
    expect(text("C171")).toContain("1,000 筆保護");
    expect(text("C161")).toContain("最多 480 分鐘");
    expect(text("C129")).toContain("點名時核對方案");
    expect(text("I08")).toContain("載入較慢，仍在讀取");
    expect(text("F04")).toContain("不再附登入處理步驟");
    expect(text("E08")).toContain("返回清單");
  });
  it("records a complete 10-commit audit while preserving the previous scoped alignment", () => {
    const state = JSON.parse(readFileSync("docs/operation-guide-audit-state-20261025.json", "utf8"));
    expect(state.auditDateTaipei).toBe("2026-10-25");
    expect(state.lastInventoriedMainCommit).toBe("4efcd72bf513953521665f2556f719d1f73b5e8c");
    expect(state.reviewedMainCommitCount).toBe(237);
    expect(state.newGuideIds).toEqual(["C177"]);
    expect(state.updatedGuideIds).toHaveLength(9);
    expect(state.cumulativeDraftNewGuideIds).toHaveLength(14);
    expect(state.cumulativeDraftUpdatedGuideIds).toHaveLength(74);
    expect(state.cumulativeDraftUpdatedGuideIds.some((id: string) => state.cumulativeDraftNewGuideIds.includes(id))).toBe(false);
    expect(state.backendInteractionPendingCount).toBe(93);
    expect(state.frontendInteractionPendingGuideIds).toEqual([]);
    expect(state.authenticatedAcceptance.guideIdsCleared).toEqual([]);
    expect(state.scopedProductionAlignment.productionCommit).toBe("8d717d5dc45da6fbd4e2984afea48165140281b3");
    expect(state.currentAuditReuse.guideIds).toHaveLength(12);
    expect(state.backendInterfaceFollowups[0].status).toBe("not-connected-to-visible-entry");
    expect(operationGuides).toHaveLength(209);
    expect(guideCategories).toHaveLength(15);
  });
});
