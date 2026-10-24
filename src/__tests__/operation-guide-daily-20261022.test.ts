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
const access = (module: GuideAccess["module"]): GuideAccess => ({ module, permissions, features });
const guide = (id: string) => operationGuides.find((item) => item.id === id)!;

describe("2026-10-22 backend guide audit", () => {
  it("records the exact main range and backend-only accounting", () => {
    const state = JSON.parse(readFileSync("docs/operation-guide-audit-state.json", "utf8"));
    expect(state.auditDateTaipei).toBe("2026-10-23");
    expect(state.previousSuccessfulAuditCommit).toBe("abfe50b1092e9f78a1db76b575b255df5cf3524f");
    expect(state.lastInventoriedMainCommit).toBe("7cb8c26127f60337c159b05391bc90f3263246ad");
    expect(state.currentMainAudit.commitCount).toBe(8);
    expect(state.newGuideIds).toEqual(["F13"]);
    expect(state.updatedGuideIds).toEqual(["F01", "F04", "C123", "I21", "I22", "W06"]);
    expect(state.backendInteractionPendingCount).toBe(83);
    expect(state.frontendInteractionPendingGuideIds).toEqual([]);
    expect(operationGuides).toHaveLength(197);
    expect(guideCategories).toHaveLength(15);
  });

  it("finds the new steamfoot notice guide and revised operational terms", () => {
    expect(findOperationGuides("蒸足 後台異動通知 提示音", access("steamfoot")).map((item) => item.id)).toContain("A17");
    expect(findOperationGuides("更多操作 購買方案", access("steamfoot")).map((item) => item.id)).toContain("A05");
    expect(findOperationGuides("店家公告 全螢幕", access("course")).map((item) => item.id)).toContain("IMG01");
    expect(findOperationGuides("過堂補登", access("course")).map((item) => item.id)).toContain("C124");
    expect(findOperationGuides("同步警告 勿重複送出", access("course")).map((item) => item.id)).toContain("I21");
  });

  it("keeps source review separate from authenticated acceptance", () => {
    for (const id of ["A17", "A05", "IMG01", "C124", "C123", "C170", "I19", "I21"]) {
      expect(guide(id).verification, id).toBe("source-reviewed");
    }
    expect(guide("A17").sources).toEqual(expect.arrayContaining([
      "src/components/admin/steamfoot-store-notice-bell.tsx",
      "src/server/actions/steamfoot-store-notices.ts",
    ]));
    expect(guide("C170").details.join(" ")).toContain("清單在開啟時才讀取");
    expect(guide("I19").details.join(" ")).toContain("不再要求先完成 LINE 官方帳號、LIFF Channel 或入口網址設定");
  });
});
