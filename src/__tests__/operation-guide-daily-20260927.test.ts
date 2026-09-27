import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { availableGuides, findOperationGuides, operationGuides } from "../lib/operation-guide";
import type { GuideAccess } from "../lib/operation-guide-types";

const guide = (id: string) => operationGuides.find(item => item.id === id)!;
const spa: GuideAccess = { module: "spa", permissions: ["report.read"], features: { basic_reports: true } };
const steam: GuideAccess = { module: "steamfoot", permissions: ["booking.read", "report.read"], features: { basic_reports: true } };

describe("September 27 guide review", () => {
  it("keeps SPA analytics isolated and permission gated", () => {
    expect(availableGuides(spa).some(item => item.id === "H11")).toBe(true);
    expect(availableGuides({...spa, features: {}}).some(item => item.id === "H11")).toBe(false);
    expect(availableGuides({...spa, permissions: []}).some(item => item.id === "H11")).toBe(false);
    expect(availableGuides(steam).some(item => item.id === "H11")).toBe(false);
    expect(availableGuides(spa).some(item => item.id === "H03")).toBe(false);
    expect(availableGuides(steam).some(item => item.id === "H03")).toBe(true);
  });

  it("finds direct dialing, date-range and SPA metric instructions", () => {
    expect(findOperationGuides("顧客電話 直接撥打", steam).map(item => item.id)).toContain("A05");
    expect(findOperationGuides("起始日期 結束日期 較前期", steam).map(item => item.id)).toContain("H01");
    expect(findOperationGuides("SPA 體驗開卡率 回流率", spa).map(item => item.id)).toContain("H11");
    expect(JSON.stringify(guide("H11"))).toContain("不顯示營收");
    expect(JSON.stringify(guide("I08"))).toContain("可用寬度");
  });

  it("keeps every affected article traceable to current source files", () => {
    for (const id of ["A05", "H01", "H03", "H09", "H11", "I08"]) {
      expect(guide(id).verification).toBe("source-reviewed");
      for (const source of guide(id).sources) expect(existsSync(source), source).toBe(true);
    }
  });
});
