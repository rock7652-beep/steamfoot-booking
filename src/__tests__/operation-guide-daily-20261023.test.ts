import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { findOperationGuides, guideCategories, operationGuides } from "../lib/operation-guide";
import type { GuideAccess } from "../lib/operation-guide-types";

const permissions = [
  ...new Set(
    operationGuides
      .flatMap((guide) => [guide.permission, ...(guide.additionalPermissions ?? [])])
      .filter(Boolean),
  ),
] as GuideAccess["permissions"];
const features = Object.fromEntries(
  operationGuides.filter((guide) => guide.feature).map((guide) => [guide.feature!, true]),
);
const access = (guideModule: GuideAccess["module"]): GuideAccess => ({
  module: guideModule,
  permissions,
  features,
});
const guide = (id: string) => operationGuides.find((item) => item.id === id)!;

describe("2026-10-23 backend guide audit", () => {
  it("records the exact main range and backend-only accounting", () => {
    const state = JSON.parse(readFileSync("docs/operation-guide-audit-state.json", "utf8"));
    expect(state.auditDateTaipei).toBe("2026-10-23");
    expect(state.previousSuccessfulAuditCommit).toBe("abfe50b1092e9f78a1db76b575b255df5cf3524f");
    expect(state.lastInventoriedMainCommit).toBe("7cb8c26127f60337c159b05391bc90f3263246ad");
    expect(state.currentMainAudit.commitCount).toBe(8);
    expect(state.currentMainAudit.pullRequests).toEqual([1387, 1388, 1389, 1390, 1391, 1392, 1393, 1394]);
    expect(state.newGuideIds).toEqual(["F13"]);
    expect(state.updatedGuideIds).toEqual(["F01", "F04", "C123", "I21", "I22", "W06"]);
    expect(state.backendInteractionPendingCount).toBe(83);
    expect(state.frontendInteractionPendingGuideIds).toEqual([]);
    expect(operationGuides).toHaveLength(197);
    expect(guideCategories).toHaveLength(15);
  });

  it("finds the LINE quota email guide in both backend modules", () => {
    for (const guideModule of ["steamfoot", "course"] as const) {
      expect(findOperationGuides("LINE 額度 Email 80% 95%", access(guideModule)).map((item) => item.id)).toContain("F13");
    }
    expect(guide("F13").details.join(" ")).toContain("所有啟用中的老闆登入 Email");
    expect(guide("F13").important).toContain("不會增加 LINE 額度");
    expect(guide("F13").verification).toBe("source-reviewed");
  });

  it("documents reminder navigation, independent saves and entitlement boundaries", () => {
    expect(guide("F01").steps.join(" ")).toContain("提醒類型");
    expect(guide("F01").steps.join(" ")).toContain("通知分類下拉選單");
    expect(guide("I21").details.join(" ")).toContain("不同個別開關可獨立儲存");
    expect(guide("C123").details.join(" ")).toContain("不重新整理整個後台版面");
    expect(guide("W06").details.join(" ")).toContain("工單功能未開通時");
    expect(guide("I22").details.join(" ")).toContain("操作見 F13");
  });
});
