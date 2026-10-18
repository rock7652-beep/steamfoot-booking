import { describe, expect, it } from "vitest";
import { findOperationGuides, operationGuides } from "../lib/operation-guide";
import type { GuideAccess } from "../lib/operation-guide-types";

const allPermissions = [...new Set(operationGuides.flatMap(guide => [guide.permission, ...(guide.additionalPermissions ?? [])]).filter(Boolean))];
const features = Object.fromEntries(operationGuides.filter(guide => guide.feature).map(guide => [guide.feature!, true]));

describe("2026-10-11 backend operation guide audit", () => {
  it("adds four source-reviewed backend guides and excludes retired frontend articles", () => {
    expect(operationGuides).toHaveLength(187);
    for (const id of ["A15", "A16", "I21", "C169"]) {
      const guide = operationGuides.find(item => item.id === id);
      expect(guide?.verification, id).toBe("source-reviewed");
    }
    for (const id of ["C09", "J17", "J19", "J20", "J21", "C101", "C125", "C136"]) {
      expect(operationGuides.some(item => item.id === id), id).toBe(false);
    }
  });

  it("finds the new steamfoot participant and shared settings workflows", () => {
    const steam: GuideAccess = { module: "steamfoot", permissions: allPermissions, features };
    expect(findOperationGuides("臨時加人 原預約人數", steam).map(guide => guide.id)).toContain("A15");
    expect(findOperationGuides("逐人收款 本人方案", steam).map(guide => guide.id)).toContain("A16");
    expect(findOperationGuides("設定 儲存失敗 重試", steam).map(guide => guide.id)).toContain("I21");
  });

  it("keeps the music teacher article in the backend staff workflow", () => {
    const course: GuideAccess = { module: "course", permissions: allPermissions, features, music: true };
    expect(findOperationGuides("共同分潤 個別調整 LINE", course).map(guide => guide.id)).toContain("C169");
    expect(operationGuides.find(guide => guide.id === "C114")?.title).not.toContain("我的工作");
  });
});
