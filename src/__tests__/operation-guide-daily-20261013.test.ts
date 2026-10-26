import { describe, expect, it } from "vitest";
import { findOperationGuides, operationGuides } from "../lib/operation-guide";
import type { GuideAccess } from "../lib/operation-guide-types";

const allPermissions = [...new Set(operationGuides.flatMap(guide => [guide.permission, ...(guide.additionalPermissions ?? [])]).filter(Boolean))];
const features = Object.fromEntries(operationGuides.filter(guide => guide.feature).map(guide => [guide.feature!, true]));
const steamfoot: GuideAccess = { module: "steamfoot", permissions: allPermissions, features };
const course: GuideAccess = { module: "course", permissions: allPermissions, features, music: false };

describe("2026-10-13 backend operation guide audit", () => {
  it("adds one source-reviewed work-order notification guide", () => {
    expect(operationGuides).toHaveLength(205);
    const guide = operationGuides.find(item => item.id === "W06");
    expect(guide?.verification).toBe("source-reviewed");
    expect(guide?.modules).toEqual(["steamfoot", "course"]);
    expect(guide?.important).toContain("不會替店家收款");
  });

  it("finds current labels for changed backend flows", () => {
    expect(findOperationGuides("待取件 本店會員連結", steamfoot).map(g => g.id)).toContain("W06");
    expect(findOperationGuides("上月顧客回流 已回訪", course).map(g => g.id)).toContain("C115");
    expect(findOperationGuides("本人請假 整堂改期", course).map(g => g.id)).toContain("C169");
    expect(findOperationGuides("工單待取件", course).map(g => g.id)).toEqual(expect.arrayContaining(["C123", "W06"]));
  });
});
