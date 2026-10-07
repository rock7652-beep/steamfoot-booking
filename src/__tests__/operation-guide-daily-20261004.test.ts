import { describe, expect, it } from "vitest";
import { availableGuides, findOperationGuides, operationGuides } from "../lib/operation-guide";
import { findCoursePortalGuides } from "../lib/course-portal-guides";
import type { GuideAccess } from "../lib/operation-guide-types";

const access: GuideAccess = { module: "course", permissions: ["booking.read", "booking.update", "customer.read", "customer.update", "wallet.read", "staff.manage"], features: { frontend_preview: true, customer_labels: true } };
describe("October 4 guide access and search", () => {
  it("requires all member preview permissions and the distinct feature", () => {
    expect(availableGuides(access).some(g => g.id === "I16")).toBe(true);
    for (const permission of ["booking.read", "customer.read", "wallet.read"]) {
      expect(availableGuides({...access, permissions: access.permissions.filter(p => p !== permission)}).some(g => g.id === "I16")).toBe(false);
    }
    expect(availableGuides({...access, features: {customer_labels: true}}).some(g => g.id === "I16")).toBe(false);
  });
  it("shares label guidance across modules without duplicating articles or bypassing editing access", () => {
    for (const guideModule of ["steamfoot", "spa", "course"] as const) {
      expect(findOperationGuides("拖拉 方向鍵", {...access, module: guideModule}).map(g => g.id)).toContain("C160");
      expect(availableGuides({...access, module: guideModule, permissions: ["customer.read"]}).some(g => g.id === "C160")).toBe(false);
    }
    expect(new Set(operationGuides.map(g => g.id)).size).toBe(operationGuides.length);
  });
  it("keeps course companion operations out of steamfoot and spa", () => {
    expect(findOperationGuides("同行 本人方案", access).map(g => g.id)).toContain("C166");
    for (const guideModule of ["steamfoot", "spa"] as const) expect(availableGuides({...access, module: guideModule}).some(g => g.id === "C166")).toBe(false);
    expect(availableGuides({...access, permissions: ["booking.read"]}).some(g => g.id === "C166")).toBe(false);
  });
  it("requires management permission for HQ archive and navigation guidance", () => {
    expect(findOperationGuides("封存 還原", access).map(g => g.id)).toContain("I17");
    expect(findOperationGuides("顧客名單 統計日期", access).map(g => g.id)).toContain("I18");
    expect(availableGuides({...access, permissions: ["booking.read"]}).some(g => ["I17", "I18"].includes(g.id))).toBe(false);
  });
  it("keeps source-added companion help conditional on the portal capability", () => {
    expect(findCoursePortalGuides("member", true, "", true)).toHaveLength(13);
    expect(findCoursePortalGuides("coach", true, "", true)).toHaveLength(8);
    expect(findCoursePortalGuides("coach", true, "已收款", true).map(g => g.id)).toContain("CP21");
    expect(findCoursePortalGuides("coach", true, "已收款", false).map(g => g.id)).not.toContain("CP21");
  });
});

