import { describe, expect, it } from "vitest";
import { availableGuides, findOperationGuides, relatedOperationGuides } from "../lib/operation-guide";
import type { GuideAccess } from "../lib/operation-guide-types";

const course: GuideAccess = { module: "course", permissions: ["report.read", "booking.read", "staff.manage", "cashbook.create"], features: { service_fee_calculator: true } };
describe("September 25 guide review", () => {
  it("gates monthly articles by module, feature and distinct settings/payment permissions", () => {
    for (const industry of ["steamfoot", "spa"] as const) expect(availableGuides({...course,module:industry}).some(g => ["C138","C139","C140"].includes(g.id))).toBe(false);
    expect(availableGuides({...course,features:{}}).some(g => ["C138","C139","C140"].includes(g.id))).toBe(false);
    const readOnly = availableGuides({...course,permissions:["report.read"]}).map(g=>g.id);
    expect(readOnly).toContain("C138");
    expect(readOnly).not.toContain("C139");
    expect(readOnly).not.toContain("C140");
    expect(relatedOperationGuides("/s/test/admin/dashboard/service-fee-calculator",course).map(g=>g.id)).toEqual(expect.arrayContaining(["C138","C139","C140"]));
  });
  it("finds new workflows and keeps slot capacity rules separate", () => {
    for (const [query,id] of [["修正版","C138"],["獨立開關","C139"],["分次付款 溢付","C140"],["月表 週表 日表","C141"],["更名","I10"],["試用授權","S04"]]) expect(findOperationGuides(query,course).some(g=>g.id===id)).toBe(true);
    const steam: GuideAccess = {module:"steamfoot",permissions:["business_hours.manage"],features:{}};
    expect(findOperationGuides("名額 0 已額滿",steam).some(g=>g.id==="B06")).toBe(true);
    expect(findOperationGuides("名額 0 已額滿",course).some(g=>g.id==="B06")).toBe(false);
  });
});
