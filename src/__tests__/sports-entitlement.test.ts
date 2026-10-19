import { describe, expect, it } from "vitest";
import { resolveSportsEntitlement, sportsEntitlementSnapshot } from "@/lib/sports-entitlement";

const lesson = { templateId: "course-a", subjectId: "yoga", pointCost: 3, enrollment: "ASSIGNED" as const, legacyPlanId: "old-package" };
const card = { planId: "package-a", templateIds: ["old-template"], unit: "POINT", sportsMode: "ASSIGNED", sportsSubjectId: "yoga", sportsCost: 2 };

describe("sports entitlement purchase snapshots and deduction", () => {
  it("keeps each learner's purchased deduction, independent of scheduled sales package", () => {
    expect(resolveSportsEntitlement(card, lesson)).toEqual({ eligible: true, cost: 2 });
    expect(resolveSportsEntitlement({ ...card, planId: "package-b", sportsCost: 4 }, lesson)).toEqual({ eligible: true, cost: 4 });
  });
  it("rejects another subject and assigned rights used for open enrollment", () => {
    expect(resolveSportsEntitlement(card, { ...lesson, subjectId: "dance" }).eligible).toBe(false);
    expect(resolveSportsEntitlement(card, { ...lesson, enrollment: "OPEN" }).eligible).toBe(false);
  });
  it("uses one universal card across open subjects, charging each course's rule", () => {
    const universal = { ...card, sportsMode: "OPEN", sportsSubjectId: null, sportsCost: null };
    expect(resolveSportsEntitlement(universal, { ...lesson, enrollment: "OPEN" })).toEqual({ eligible: true, cost: 3 });
    expect(resolveSportsEntitlement(universal, { ...lesson, enrollment: "OPEN", subjectId: "dance", pointCost: 2 })).toEqual({ eligible: true, cost: 2 });
    expect(resolveSportsEntitlement(universal, lesson).eligible).toBe(false);
    expect(resolveSportsEntitlement(universal, { ...lesson, enrollment: null }).eligible).toBe(false);
  });
  it("keeps old plan and template restrictions without reclassifying empty templates as universal", () => {
    const old = { planId: "old-package", templateIds: ["course-a"], unit: "POINT" };
    expect(sportsEntitlementSnapshot(old)).toEqual({ sportsMode: "LEGACY", sportsSubjectId: null, sportsCost: null });
    expect(resolveSportsEntitlement(old, lesson)).toEqual({ eligible: true, cost: 3 });
    expect(resolveSportsEntitlement({ ...old, planId: "other" }, lesson).eligible).toBe(false);
    expect(resolveSportsEntitlement({ ...old, templateIds: ["other"] }, lesson).eligible).toBe(false);
    expect(resolveSportsEntitlement({ ...old, templateIds: [] }, { ...lesson, enrollment: null, legacyPlanId: null }).eligible).toBe(true);
  });
  it("does not silently expand legacy empty-template cards to new modes", () => {
    const legacy={planId:"old",unit:"POINT",templateIds:[]};
    expect(resolveSportsEntitlement(legacy,{...lesson,legacyPlanId:null}).eligible).toBe(false);
    expect(resolveSportsEntitlement(legacy,{...lesson,legacyPlanId:null,enrollment:"OPEN"}).eligible).toBe(false);
  });
  it("does not reinterpret a purchase after plan changes or when confirming the order", () => {
    const plan = { ...card };
    const order = { unit: plan.unit, ...sportsEntitlementSnapshot(plan) };
    plan.sportsCost = 9;
    plan.sportsSubjectId = "dance";
    const grantedCard = { ...card, ...sportsEntitlementSnapshot(order) };
    expect(resolveSportsEntitlement(grantedCard, lesson)).toEqual({ eligible: true, cost: 2 });
  });
  it("rejects corrupt modes, mixed fields and invalid costs instead of falling back to legacy", () => {
    for (const patch of [{ sportsMode: "UNKNOWN" }, { sportsCost: 0 }, { sportsCost: 1.5 }, { sportsSubjectId: null }, { sportsMode: "LEGACY" }]) {
      expect(resolveSportsEntitlement({ ...card, ...patch }, lesson).eligible).toBe(false);
      expect(() => sportsEntitlementSnapshot({ ...card, ...patch })).toThrow();
    }
    expect(resolveSportsEntitlement({ ...card, unit: "SESSION" }, lesson).eligible).toBe(false);
    expect(resolveSportsEntitlement({ ...card, unit: "SESSION", sportsCost: 1 }, lesson)).toEqual({ eligible: true, cost: 1 });
  });
  it("retains the narrower original-course restriction for makeup rights", () => {
    const makeup = { ...card, templateRestricted: true, templateIds: [lesson.templateId] };
    expect(resolveSportsEntitlement(makeup, lesson).eligible).toBe(true);
    expect(resolveSportsEntitlement(makeup, { ...lesson, templateId: "another-yoga-course" }).eligible).toBe(false);
  });
});
