import { describe, expect, it } from "vitest";
import { findOperationGuides, operationGuides, guideCategories } from "../lib/operation-guide";
import type { GuideAccess } from "../lib/operation-guide-types";

const permissions = [...new Set(operationGuides.flatMap(g => [g.permission, ...(g.additionalPermissions ?? [])]).filter(Boolean))];
const features = Object.fromEntries(operationGuides.filter(g => g.feature).map(g => [g.feature!, true]));
const access: GuideAccess = { module: "steamfoot", permissions, features };
const text = (id: string) => JSON.stringify(operationGuides.find(g => g.id === id));

describe("2026-10-17 backend guide review", () => {
  it("explains the restored month summary without changing settlement guidance", () => {
    expect(text("A05")).toContain("剩 X 堂・方案名稱・到期日");
    expect(text("A05")).toContain("無到期限制");
    expect(text("A05")).toContain("方案待核對");
    expect(text("A05")).toContain("不能把剩餘堂數都當成可再預約堂數");
    expect(text("A16")).toContain("這不改變選方案先保留、完成才扣堂的流程");
    expect(findOperationGuides("方案待核對", access).map(g => g.id)).toEqual(expect.arrayContaining(["A05", "A16"]));
    expect(findOperationGuides("方案待核對", { ...access, module: "spa" })).toEqual([]);
  });
  it("keeps the backend catalog counts after SPA retirement", () => {
    expect(operationGuides).toHaveLength(196);
    expect(guideCategories).toHaveLength(15);
  });
});
