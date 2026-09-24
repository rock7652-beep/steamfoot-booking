import { describe, expect, it } from "vitest";
import { availableGuides, findOperationGuides } from "../lib/operation-guide";
import { spaOperationGuides } from "../lib/spa-operation-guides";
import type { GuideAccess } from "../lib/operation-guide-types";

const spa: GuideAccess = { module: "spa", permissions: ["booking.read", "booking.update", "customer.read", "duty.manage"], features: {} };
describe("SPA guide access and search", () => {
  it("keeps SPA instructions out of the other modules and respects action permissions", () => {
    for (const industry of ["steamfoot", "course"] as const) {
      expect(availableGuides({ ...spa, module: industry }).some(g => spaOperationGuides.some(s => s.id === g.id))).toBe(false);
    }
    const readOnly = availableGuides({...spa, permissions:["booking.read"]});
    expect(readOnly.some(g => g.id === "J15" || g.id === "J22")).toBe(false);
    expect(availableGuides(spa).some(g => g.id === "J15")).toBe(true);
  });
  it("finds distinct customer and staff troubleshooting scenarios", () => {
    for (const [query, id] of [["取消截止 12", "J18"], ["會員連結", "J15"], ["工作 備註", "J20"], ["LINE 未送達", "J23"]]) {
      expect(findOperationGuides(query, spa).some(g => g.id === id)).toBe(true);
    }
  });
});
