import { describe, expect, it } from "vitest";
import { resolveSportsEntitlement, sportsEntitlementSnapshot, sportsBookingEnrollment, sportsOpenPlanTemplateIds } from "@/lib/sports-entitlement";

const lesson = { templateId: "course-a", subjectId: "yoga", pointCost: 3, enrollment: "ASSIGNED" as const, legacyPlanId: "old-package" };
const card = { planId: "package-a", templateIds: ["old-template"], unit: "POINT", sportsMode: "ASSIGNED", sportsSubjectId: "yoga", sportsCost: 2 };

describe("sports entitlement purchase snapshots and deduction", () => {
  it("keeps each learner's purchased deduction, independent of scheduled sales package", () => {
    expect(resolveSportsEntitlement(card, lesson)).toEqual({ eligible: true, cost: 2 });
    expect(resolveSportsEntitlement({ ...card, planId: "package-b", sportsCost: 4 }, lesson)).toEqual({ eligible: true, cost: 4 });
  });
  it("rejects another subject and accepts the same subject for open enrollment", () => {
    expect(resolveSportsEntitlement(card, { ...lesson, subjectId: "dance" }).eligible).toBe(false);
    expect(resolveSportsEntitlement(card, { ...lesson, enrollment: "OPEN" }).eligible).toBe(true);
  });
  it("requires explicit subject review for old unscoped open cards", () => {
    const universal = { ...card, sportsMode: "OPEN", sportsSubjectId: null, sportsCost: null };
    expect(resolveSportsEntitlement(universal, { ...lesson, enrollment: "OPEN" })).toMatchObject({ eligible: false });
    expect(resolveSportsEntitlement(universal, { ...lesson, enrollment: "OPEN", subjectId: "dance", pointCost: 2 })).toMatchObject({ eligible: false });
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

it('assigned legacy lesson-count packages follow verified teaching item rather than selected 10/20/trial plan',()=>{
 const lesson={templateId:'current',subjectId:'dance',pointCost:1,enrollment:'ASSIGNED' as const,legacyPlanId:'trial-plan',compatibleTemplateIds:['old-10','old-20','current']};
 for(const [planId,templateId] of [['ten','old-10'],['twenty','old-20']])
  expect(resolveSportsEntitlement({planId,unit:'SESSION',sportsMode:'LEGACY',templateIds:[templateId]},lesson)).toEqual({eligible:true,cost:1});
 expect(resolveSportsEntitlement({planId:'yoga',unit:'SESSION',sportsMode:'LEGACY',templateIds:['yoga']},lesson).eligible).toBe(false);
 expect(resolveSportsEntitlement({planId:'unknown',unit:'SESSION',sportsMode:'LEGACY',templateIds:[]},lesson).eligible).toBe(false);
 expect(resolveSportsEntitlement({planId:'points',unit:'POINT',sportsMode:'LEGACY',templateIds:['old-10']},lesson)).toEqual({eligible:true,cost:1});
 expect(resolveSportsEntitlement({planId:'makeup',unit:'SESSION',sportsMode:'LEGACY',templateIds:['old-10'],templateRestricted:true},lesson).eligible).toBe(false);
 expect(resolveSportsEntitlement({planId:'ten',unit:'SESSION',sportsMode:'LEGACY',templateIds:['old-10']},{...lesson,enrollment:'OPEN'}).eligible).toBe(true);
});


it('only gives mixed assigned rights to the persisted fixed reservation, never a new self booking or companion',()=>{
 const rule={enrollment:'OPEN',payload:{students:[{customerId:'fixed'}]}};
 const booking={customerId:'fixed',requestKey:'sports-fixed:session:fixed',session:{id:'session',requestKey:'series',requestIndex:3}};
 expect(sportsBookingEnrollment(rule,booking)).toBe('ASSIGNED');
 expect(sportsBookingEnrollment(rule,{...booking,requestKey:'series:3:fixed'})).toBe('ASSIGNED');
 expect(sportsBookingEnrollment(rule,{...booking,requestKey:'new-self-booking'})).toBe('OPEN');
 expect(sportsBookingEnrollment(rule,{...booking,companionIndex:1})).toBe('OPEN');
 expect(sportsBookingEnrollment({...rule,payload:{students:[]}},booking)).toBe('OPEN');
 expect(sportsBookingEnrollment(rule,{...booking,requestKey:'sports-fixed:other-session:fixed'})).toBe('OPEN');
});


describe('explicit multi-subject scopes',()=>{
 const universal={...card,sportsMode:'SUBJECTS',sportsSubjectId:null,sportsSubjectIds:['yoga','dance'],sportsCost:2};
 it.each(['OPEN','ASSIGNED',null] as const)('accepts only listed subjects with %s enrollment',enrollment=>{
  for(const subjectId of ['yoga','dance'])expect(resolveSportsEntitlement(universal,{...lesson,subjectId,enrollment})).toEqual({eligible:true,cost:2});
  for(const subjectId of ['piano','later-added',null])expect(resolveSportsEntitlement(universal,{...lesson,subjectId,enrollment}).eligible).toBe(false);
 });
 it('copies the subject scope when an order is created and when the order issues a card',()=>{
  const plan={...universal,sportsSubjectIds:['yoga','dance']};
  const order={unit:'POINT',...sportsEntitlementSnapshot(plan)};
  plan.sportsSubjectIds.push('piano');
  const granted={...card,...sportsEntitlementSnapshot(order)};
  expect(granted).toMatchObject({sportsMode:'SUBJECTS',sportsSubjectIds:['yoga','dance']});
  expect(resolveSportsEntitlement(granted,{...lesson,subjectId:'piano'}).eligible).toBe(false);
 });
 it('fails closed on incomplete, duplicate, mixed and invalid multi-subject snapshots',()=>{
  for(const patch of [{sportsSubjectIds:[]},{sportsSubjectIds:['yoga','yoga']},{sportsSubjectIds:undefined},{sportsSubjectId:'yoga'},{unit:'SESSION',sportsCost:2},{sportsMode:'ASSIGNED',sportsSubjectId:'yoga'}]){
   expect(()=>sportsEntitlementSnapshot({...universal,...patch})).toThrow();
   expect(resolveSportsEntitlement({...universal,...patch},lesson).eligible).toBe(false);
  }
 });
 it('keeps makeup template restrictions even within a selected subject',()=>{
  expect(resolveSportsEntitlement({...universal,templateRestricted:true,templateIds:['original']},lesson).eligible).toBe(false);
  expect(resolveSportsEntitlement({...universal,unit:'SESSION',sportsCost:1},lesson)).toEqual({eligible:true,cost:1});
 });
});

const universalCharge = {kind:'plan',durationMinutes:60,trialPrice:null,trialDuration:null,providerIds:['coach']};
const universalCard = {
  planId:'dance-20',storeId:'store',unit:'SESSION',sportsMode:'OPEN',sportsSubjectId:null,sportsCost:null,templateIds:[],
  plan:{storeId:'store',templateIds:['regular-old','basic-old','special-old'],chargeSettings:universalCharge},
};
it.each(['ASSIGNED','OPEN'] as const)('uses the explicitly checked teaching items of an old universal card in %s lessons',enrollment=>{
  const before=JSON.stringify(universalCard);
  for(const templateId of universalCard.plan.templateIds){
    expect(resolveSportsEntitlement(universalCard,{...lesson,templateId,enrollment,legacyPlanId:'trial-fee',pointCost:9})).toEqual({eligible:true,cost:1});
    expect(resolveSportsEntitlement(universalCard,{...lesson,templateId:'new-version',enrollment,compatibleTemplateIds:[templateId]})).toEqual({eligible:true,cost:1});
  }
  expect(resolveSportsEntitlement(universalCard,{...lesson,templateId:'one-to-one',enrollment,compatibleTemplateIds:['one-to-one']})).toMatchObject({eligible:false,reason:'方案科目不符'});
  expect(JSON.stringify(universalCard)).toBe(before);
});
it('keeps unconfigured, cross-store, point and invalid universal cards blocked',()=>{
  for(const change of [
    {plan:null}, {storeId:'foreign'}, {unit:'POINT'},
    {plan:{...universalCard.plan,templateIds:[]}},
    {plan:{...universalCard.plan,chargeSettings:null}},
    {plan:{...universalCard.plan,chargeSettings:{...universalCharge,kind:'single'}}},
  ])expect(resolveSportsEntitlement({...universalCard,...change},{...lesson,templateId:'special-old'})).toMatchObject({eligible:false});
  expect(resolveSportsEntitlement({...universalCard,sportsCost:2},{...lesson,templateId:'special-old'})).toMatchObject({eligible:false});
});
it('projects only explicit universal scope for client eligibility and preserves assigned snapshots',()=>{
  const openScopeTemplateIds=sportsOpenPlanTemplateIds(universalCard);
  expect(openScopeTemplateIds).toEqual(universalCard.plan.templateIds);
  expect(resolveSportsEntitlement({...universalCard,plan:null,openScopeTemplateIds},{...lesson,templateId:'special-old'})).toEqual({eligible:true,cost:1});
  expect(sportsOpenPlanTemplateIds({...universalCard,sportsMode:'ASSIGNED'})).toEqual([]);
  expect(resolveSportsEntitlement({...card,...{plan:universalCard.plan,storeId:'store'}},lesson)).toEqual({eligible:true,cost:2});
});
