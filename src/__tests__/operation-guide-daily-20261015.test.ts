import { describe, expect, it } from "vitest";
import { availableGuides, findOperationGuides, guideCategories, operationGuides, retiredSpaOperationGuides } from "../lib/operation-guide";
import { additionalGuides } from "../lib/operation-guide-catalog";
import type { GuideAccess } from "../lib/operation-guide-types";
import { readFileSync } from "node:fs";

const permissions = [...new Set(operationGuides.flatMap(g => [g.permission, ...(g.additionalPermissions ?? [])]).filter(Boolean))];
const features = Object.fromEntries(operationGuides.filter(g => g.feature).map(g => [g.feature!, true]));
const access = (module: GuideAccess["module"]): GuideAccess => ({ module, permissions, features });
const guide = (id: string) => operationGuides.find(g => g.id === id)!;

describe("2026-10-15 backend guide review", () => {
  it("archives SPA verbatim without presenting retirement as acceptance", () => {
    expect(operationGuides).toHaveLength(203);
    expect(guideCategories).toHaveLength(15);
    expect(retiredSpaOperationGuides).toHaveLength(18);
    expect(availableGuides(access("spa"))).toEqual([]);
    expect(findOperationGuides("LINE", access("spa"))).toEqual([]);
    expect(operationGuides.every(g => !g.modules.includes("spa"))).toBe(true);
    expect(guideCategories.some(g => g.id === "spa")).toBe(false);
    expect(retiredSpaOperationGuides.find(g => g.id === "J01")).toEqual(additionalGuides.find(g => g.id === "J01"));
    const state = JSON.parse(readFileSync("docs/operation-guide-audit-state.json", "utf8"));
    expect(state.spaGuideRetirement.status).toBe("retired-not-verified");
    expect(state.spaGuideRetirement.guideIds.sort()).toEqual(retiredSpaOperationGuides.map(g => g.id).sort());
    expect(state.interactionPendingGuideIds).not.toContain("J24");
  });

  it("separates notification binding, store link approval and member login", () => {
    expect(guide("F04").details.join(" ")).toContain("不再要求會員確認碼");
    expect(guide("C08").details.join(" ")).toContain("不建立或移轉登入帳號");
    expect(guide("C07").details.join(" ")).toContain("姓名及手機都符合唯一既有名單");
    expect(guide("C08").details.join(" ")).toContain("查核編號");
    expect(guide("C117").details.join(" ")).toContain("共享官方 LINE");
    expect(guide("W06").details.join(" ")).toContain("確實出現待確認申請");
    expect(guide("I17").details.join(" ")).toContain("不會恢復 SPA 入口");
  });
});
