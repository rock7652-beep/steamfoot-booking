import { describe,it,expect } from "vitest";
import { businessComparisonRange,summarizeCourseBusiness,resolveBusinessScope,type BusinessPurchase,type BusinessSession } from "@/lib/course-business-analytics";
import { parseTaipeiDateTime } from "@/lib/date-utils";
const at=(date:string)=>parseTaipeiDateTime(date,"12:00")!;
const purchase=(id:string,date:string,customerId="a",owner:string|null="m1"):BusinessPurchase=>({id,customerId,confirmedAt:at(date),price:1000,revenueStaffId:owner,developerProfitSnapshot:300,refunds:[]});
const session=(id:string,date:string,customerId="a",coachId="c1"):BusinessSession=>({id,coachId,startsAt:at(date),endsAt:new Date(+at(date)+3600000),bookings:[{customerId,customerName:customerId,bookingKind:"TRIAL",status:"ATTENDED"}]});
const data={customers:[{id:"a",name:"A",managerId:"m1"},{id:"b",name:"B",managerId:"m2"}],sessions:[session("s1","2026-09-02"),session("s2","2026-09-03")],purchases:[purchase("p1","2026-09-04"),purchase("p2","2026-09-05")],fees:[],range:{startDate:"2026-09-01",endDate:"2026-09-30"},scope:{view:"store" as const,person:"all"},now:at("2026-09-30")};
describe("course business analytics",()=>{
 it("counts people once while separating new and renewal purchases",()=>{const r=summarizeCourseBusiness(data);expect(r.trial).toHaveLength(1);expect(r.newCard).toHaveLength(1);expect(r.renewal).toHaveLength(1);expect(r.conversionRate).toBe(100);expect(r.attendance).toBe(2);});
 it("keeps past trial conversions out of the current trial denominator",()=>{const r=summarizeCourseBusiness({...data,sessions:[session("s0","2026-08-20")],purchases:[purchase("p1","2026-09-04")]});expect(r.tracked).toHaveLength(1);expect(r.trial).toHaveLength(0);expect(r.newCard).toHaveLength(1);expect(r.conversionRate).toBeNull();});
 it("does not use an existing member trial as a new-customer conversion",()=>{const r=summarizeCourseBusiness({...data,purchases:[purchase("p0","2026-08-01"),purchase("p1","2026-09-04")]});expect(r.trial).toHaveLength(1);expect(r.eligibleTrials).toBe(0);expect(r.conversionRate).toBeNull();expect(r.renewal).toHaveLength(1);});
 it("uses order attribution for sales and current customer assignment for trials",()=>{const r=summarizeCourseBusiness({...data,scope:{view:"manager",person:"m2"},purchases:[purchase("p1","2026-09-04","a","m2")]});expect(r.trial).toHaveLength(0);expect(r.newCard).toHaveLength(1);});
 it("keeps missing order owner unassigned instead of inferring a cashier",()=>{const r=summarizeCourseBusiness({...data,scope:{view:"manager",person:"unassigned"},purchases:[purchase("p1","2026-09-04","a",null)]});expect(r.newCard).toHaveLength(1);});
 it("credits a new card once to the last trial coach",()=>{const shared={...data,sessions:[session("s1","2026-09-02","a","c1"),session("s2","2026-09-03","a","c2")]};expect(summarizeCourseBusiness({...shared,scope:{view:"coach",person:"c1"}}).newCard).toHaveLength(0);expect(summarizeCourseBusiness({...shared,scope:{view:"coach",person:"c2"}}).newCard).toHaveLength(1);});
 it("excludes full refunds at cutoff but not refunds in future periods",()=>{const p=purchase("p1","2026-09-04");p.refunds=[{amount:1000,createdAt:at("2026-10-01")}];expect(summarizeCourseBusiness({...data,purchases:[p]}).newCard).toHaveLength(1);p.refunds[0].createdAt=at("2026-09-10");const r=summarizeCourseBusiness({...data,purchases:[p]});expect(r.newCard).toHaveLength(0);expect(r.conversionRate).toBe(0);});
 it("does not fabricate profit for partial refunds or absent snapshots",()=>{const p=purchase("p1","2026-09-04");p.refunds=[{amount:200,createdAt:at("2026-09-05")}];const r=summarizeCourseBusiness({...data,purchases:[p]});expect(r.profit).toBe(0);expect(r.missingProfit).toBe(1);});
 it("counts fixed fees once per ended class and preserves missing fee status",()=>{const r=summarizeCourseBusiness({...data,fees:[{sessionId:"s1",staffId:"c1",rule:{mode:"CLASS",value:500}}]});expect(r.fee).toBe(500);expect(r.missingFees).toBe(1);expect(r.hours).toBe(2);});
 it("excludes uncompleted and future attendance from actual metrics",()=>{const r=summarizeCourseBusiness({...data,now:at("2026-09-02")});expect(r.sessions).toBe(0);expect(r.newCard).toHaveLength(0);});
 it("ignores zero-priced assignments in first paid plan classification",()=>{const p=purchase("free","2026-08-01");p.price=0;expect(summarizeCourseBusiness({...data,purchases:[p,...data.purchases]}).newCard).toHaveLength(1);});
 it("restricts staff views to themselves and rejects tampered selectors",()=>{expect(resolveBusinessScope({},true)).toEqual({view:"store",person:"all"});expect(resolveBusinessScope({},false,"m1")).toEqual({view:"manager",person:"m1"});expect(()=>resolveBusinessScope({perspective:"store"},false,"m1")).toThrow();expect(()=>resolveBusinessScope({perspective:"coach",person:"m2"},false,"m1")).toThrow();expect(()=>resolveBusinessScope({perspective:"bogus"},true)).toThrow();});
});

it("counts both people and repeat same-day classes, excluding absent bookings, with manager attribution",()=>{
 const pair=session("pair","2026-09-02");pair.bookings.push({...pair.bookings[0],customerId:"b",customerName:"B"},{...pair.bookings[0],customerId:"absent",status:"NO_SHOW"});
 const input={...data,sessions:[pair,session("second","2026-09-02")]};
 const store=summarizeCourseBusiness(input);expect(store.attendance).toBe(3);expect(store.visitors).toHaveLength(2);expect(store.visitors.find(p=>p.id==="a")?.visits).toBe(2);expect(store.trend[0].attendance).toBe(3);
 const manager=summarizeCourseBusiness({...input,scope:{view:"manager",person:"m1"}});expect(manager.attendance).toBe(2);expect(manager.visitors).toHaveLength(1);
});
it("uses previous full month as retention cohort but counts returning people only once",()=>{
 const result=summarizeCourseBusiness({...data,sessions:[session("old-a","2026-08-25"),session("old-b","2026-08-30","b"),session("a1","2026-09-02"),session("a2","2026-09-03"),session("new","2026-09-03","c")],now:at("2026-09-21")});
 expect(result.retentionBase).toBe(2);expect(result.returned.map(p=>p.id)).toEqual(["a"]);expect(result.notReturned.map(p=>p.id)).toEqual(["b"]);expect(result.retentionRate).toBe(50);expect(result.newVisitors.map(p=>p.id)).toEqual(["c"]);expect(result.oldVisitors.map(p=>p.id)).toEqual(["a"]);
});
it("does not call an existing store customer new when they switch coaches",()=>{
 const r=summarizeCourseBusiness({...data,sessions:[session("old","2026-08-20","a","c2"),session("newcoach","2026-09-02","a","c1")],scope:{view:"coach",person:"c1"}});expect(r.newVisitors).toHaveLength(0);expect(r.oldVisitors).toHaveLength(1);
});

it("compares month-to-date with previous month-to-date, today with yesterday and custom with equal days",()=>{
 expect(businessComparisonRange(data.range,at("2026-09-21"))?.range).toEqual({startDate:"2026-08-01",endDate:"2026-08-21"});
 expect(businessComparisonRange({startDate:"2026-09-21",endDate:"2026-09-21"},at("2026-09-21"))?.range).toEqual({startDate:"2026-09-20",endDate:"2026-09-20"});
 expect(businessComparisonRange({startDate:"2026-09-10",endDate:"2026-09-12"},at("2026-09-21"))?.range).toEqual({startDate:"2026-09-07",endDate:"2026-09-09"});
 expect(businessComparisonRange({startDate:"2026-03-01",endDate:"2026-03-31"},at("2026-04-01"))?.range).toEqual({startDate:"2026-02-01",endDate:"2026-02-28"});
 expect(businessComparisonRange({startDate:"2026-10-01",endDate:"2026-10-31"},at("2026-09-21"))).toBeNull();
});

it("counts same-day repeat renewals once per person while preserving separate days",()=>{
 const r=summarizeCourseBusiness({...data,purchases:[purchase("first","2026-08-01"),purchase("r1","2026-09-05"),purchase("r2","2026-09-05"),purchase("r3","2026-09-06")]});
 expect(r.renewal).toHaveLength(1);
 expect(r.trend.find(d=>d.date==="2026-09-05")?.renewal).toBe(1);
 expect(r.trend.find(d=>d.date==="2026-09-06")?.renewal).toBe(1);
});
it("distinguishes confirmed zero profit from wholly or partly unknown profit",()=>{
 const zero={...purchase("zero","2026-09-04"),developerProfitSnapshot:0};
 const missing={...purchase("missing","2026-09-05"),developerProfitSnapshot:null};
 expect(summarizeCourseBusiness({...data,purchases:[zero]})).toMatchObject({profit:0,knownProfit:1,missingProfit:0});
 expect(summarizeCourseBusiness({...data,purchases:[missing]})).toMatchObject({profit:0,knownProfit:0,missingProfit:1});
 expect(summarizeCourseBusiness({...data,purchases:[zero,missing]})).toMatchObject({profit:0,knownProfit:1,missingProfit:1});
});
