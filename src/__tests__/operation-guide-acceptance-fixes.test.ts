import { describe, expect, it } from "vitest";
import { availableGuides, findOperationGuides, operationGuides, relatedOperationGuides } from "../lib/operation-guide";
import type { GuideAccess } from "../lib/operation-guide-types";
const hq: GuideAccess = { module: "steamfoot", hqScope: true, permissions: ["audit.read", "staff.manage"], features: {} };

describe("operation guide logged-in acceptance corrections", () => {
  it("keeps HQ recommendations scoped and permission filtered", () => {
    expect(availableGuides(hq).map(g => g.id)).toEqual(["I11", "I12", "I18", "I19"]);
    for (const path of ["/dashboard", "/dashboard/operation-audits"]) expect(relatedOperationGuides(path, hq).map(g => g.id)).toEqual(["I11", "I12", "I18", "I19"]);
    expect(availableGuides({ ...hq, permissions: ["audit.read"] }).map(g => g.id)).toEqual(["I11", "I12"]);
    expect(availableGuides({ ...hq, permissions: ["staff.manage"] })).toEqual([]);
  });
  it("does not add audit capabilities when HQ switches into store scope", () => {
    const store = { ...hq, hqScope: false, permissions: ["staff.manage", "booking.read"] };
    expect(availableGuides(store).some(g => ["I11", "I12"].includes(g.id))).toBe(false);
    expect(findOperationGuides("返回 HQ 總部", hq).map(g => g.id)).toEqual(expect.arrayContaining(["I11", "I12"]));
  });
  it("retains I20 independent feature and permission gates", () => {
    const owner: GuideAccess = { module: "steamfoot", permissions: ["store.audit.read"], features: { store_operation_audit: true } };
    expect(availableGuides(owner).some(g => g.id === "I20")).toBe(true);
    expect(availableGuides({ ...owner, features: {} }).some(g => g.id === "I20")).toBe(false);
    expect(availableGuides({ ...owner, permissions: [] }).some(g => g.id === "I20")).toBe(false);
  });
  it("uses article names for references and finds the referenced article by its ID", () => {
    const course: GuideAccess = { module: "course", music: true, permissions: ["staff.manage", "staff.view"], features: {} };
    const from = availableGuides(course).find(g => g.id === "C114")!;
    const target = operationGuides.find(g => g.id === "C169")!;
    expect(from.title).toBe("新增教師後，為什麼還不能排課？");
    expect(from.references).toEqual([{ guideId: "C169", label: target.title }]);
    expect(from.answer).toContain(target.title);
    expect(target.steps.join(" ")).toContain("指定課程拆帳");
    expect(target.answer).toContain("固定鐘點");
    expect([from.answer, ...from.details].join(" ")).not.toContain("C169");
    expect(findOperationGuides("C169", course).map(g => g.id)).toEqual(["C169"]);
  });
  it("matches the room management navigation and create control", () => {
    const room = operationGuides.find(g => g.id === "C108")!;
    expect(room.path).toBe("店務管理 → 空間管理 → ＋ 新增空間");
    expect(room.title).toContain("新增空間");
    expect(room.keywords).toContain("教室管理");
  });
});
