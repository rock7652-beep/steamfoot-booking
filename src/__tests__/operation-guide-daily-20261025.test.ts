import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { findOperationGuides, guideCategories, operationGuides } from "../lib/operation-guide";
import type { GuideAccess } from "../lib/operation-guide-types";

const permissions = [...new Set(operationGuides.flatMap((guide) => [guide.permission, ...(guide.additionalPermissions ?? [])]).filter(Boolean))] as GuideAccess["permissions"];
const access: GuideAccess = { module: "course", permissions, features: {} };
const guide = (id: string) => operationGuides.find((item) => item.id === id)!;

describe("2026-10-25 backend guide audit", () => {
  it("records the exact main range and backend-only accounting", () => {
    const state = JSON.parse(readFileSync("docs/operation-guide-audit-state.json", "utf8"));
    expect(state.auditDateTaipei).toBe("2026-10-25");
    expect(state.previousSuccessfulAuditCommit).toBe("7cb8c26127f60337c159b05391bc90f3263246ad");
    expect(state.lastInventoriedMainCommit).toBe("4efcd72bf513953521665f2556f719d1f73b5e8c");
    expect(state.currentMainAudit.pullRequests).toEqual([1395, 1396, 1399]);
    expect(state.newGuideIds).toEqual(["C177"]);
    expect(state.updatedGuideIds).toEqual(["B11", "C123", "C130", "C144", "C148", "C149", "C150", "C152", "C154"]);
    expect(state.backendInteractionPendingCount).toBe(93);
    expect(state.frontendInteractionPendingGuideIds).toEqual([]);
    expect(operationGuides).toHaveLength(202);
    expect(guideCategories).toHaveLength(15);
  });

  it("keeps self-service controls separate from scheduling modes", () => {
    expect(guide("C168").title).toContain("自行預約、請假與改期");
    expect(guide("C177").title).toContain("開放選課與指定學員");
    expect(findOperationGuides("排課模式 開放選課 指定學員", access).map((item) => item.id)).toContain("C177");
    expect(guide("C177").important).toContain("不會取消舊課");
  });

  it("documents the released hours and music workflow boundaries", () => {
    expect(guide("B11").details.join(" ")).toContain("不再提供保留或略過選項");
    expect(guide("B11").modules).toEqual(["steamfoot"]);
    expect(guide("C149").details.join(" ")).toContain("累計期數");
    expect(guide("C150").details.join(" ")).toContain("非本期收款");
    expect(guide("C154").details.join(" ")).toContain("最前面的未繳期");
  });
});
