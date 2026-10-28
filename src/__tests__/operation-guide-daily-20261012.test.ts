import { describe, expect, it } from "vitest";
import { findOperationGuides, operationGuides } from "../lib/operation-guide";
import type { GuideAccess } from "../lib/operation-guide-types";

const allPermissions = [...new Set(operationGuides.flatMap(guide => [guide.permission, ...(guide.additionalPermissions ?? [])]).filter(Boolean))];
const features = Object.fromEntries(operationGuides.filter(guide => guide.feature).map(guide => [guide.feature!, true]));
const course: GuideAccess = { module: "course", permissions: allPermissions, features, music: false };

describe("2026-10-12 backend operation guide audit", () => {
  it("adds the source-reviewed course store notice guide", () => {
    expect(operationGuides).toHaveLength(209);
    const guide = operationGuides.find(item => item.id === "C170");
    expect(guide?.verification).toBe("source-reviewed");
    expect(guide?.modules).toEqual(["course"]);
    expect(guide?.permission).toBe("booking.read");
    expect(guide?.important).toContain("不會替任何學員點名");
  });

  it("finds notice, staff, income and retention updates using current labels", () => {
    expect(findOperationGuides("門市通知 復原", course).map(guide => guide.id)).toContain("C170");
    expect(findOperationGuides("一般拆帳 彈性拆帳", course).map(guide => guide.id)).toEqual(expect.arrayContaining(["C157", "C169"]));
    expect(findOperationGuides("本人收入 人員個別開關", course).map(guide => guide.id)).toContain("C139");
    expect(findOperationGuides("回流 基準群", course).map(guide => guide.id)).toContain("C115");
  });

  it("keeps retired frontend articles outside the current catalog", () => {
    for (const id of ["C09", "J17", "J19", "J20", "J21", "C101", "C125", "C136"]) {
      expect(operationGuides.some(item => item.id === id), id).toBe(false);
    }
  });
});
