import {beforeEach,describe,it,expect,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({enabled:true}));
vi.mock("@/lib/sports-native-preview",()=>({sportsNativePreview:()=>m.enabled}));
import {addSportsFixedLearners,bindSportsAttendanceCard} from "@/server/services/sports-permanent-series";
import {fixedSeriesOccurrenceOnDate,findOngoingFixedSeriesConflicts} from "@/lib/course-series";
import type {Prisma} from "../../generated/course-client";
const series={requestKey:"weekly",roomId:"room",coachId:"coach",startsAt:new Date("2026-11-02T08:00:00Z"),endsAt:new Date("2026-11-02T09:00:00Z"),frequency:"WEEKLY",untilDate:null,excludedDates:[],cancelledAt:null};
const actor={storeId:"sports-live-flow-store",userId:"owner",name:"老闆"};
beforeEach(()=>{m.enabled=true;});
describe("運動持續固定課",()=>{
 it("多年後仍占時段，查日曆不決定系列壽命",()=>{
  const far=fixedSeriesOccurrenceOnDate(series,"2030-11-04");expect(far?.startsAt.toISOString()).toBe("2030-11-04T08:00:00.000Z");
  expect(findOngoingFixedSeriesConflicts({...series,requestKey:"duplicate",startsAt:far!.startsAt,endsAt:far!.endsAt},[series],[])).toHaveLength(1);
 });
 it("隔週保留奇偶週，停止日期後釋出",()=>{
  expect(fixedSeriesOccurrenceOnDate({...series,frequency:"BIWEEKLY"},"2026-11-09")).toBeNull();
  expect(fixedSeriesOccurrenceOnDate({...series,frequency:"BIWEEKLY"},"2026-11-16")).not.toBeNull();
  expect(fixedSeriesOccurrenceOnDate({...series,untilDate:new Date("2026-11-08T00:00:00Z")},"2026-11-09")).toBeNull();
 });
 it("指定學員建立零額度占用名單，不查課卡、不新增保留或扣抵明細",async()=>{
  const create=vi.fn(),tx={$queryRaw:vi.fn().mockResolvedValue([{name:"學員"}]),courseBooking:{count:vi.fn().mockResolvedValue(0),findFirst:vi.fn().mockResolvedValue(null),create}};
  await addSportsFixedLearners(tx as unknown as Prisma.TransactionClient,actor,{id:"session",templateId:"template",startsAt:series.startsAt,endsAt:series.endsAt,pointCost:2,capacity:1},{perpetual:true,frequency:"WEEKLY",enrollment:"ASSIGNED",planId:"plan",students:[{customerId:"student",cardId:null}],trialPrice:0});
  expect(create).toHaveBeenCalledWith({data:expect.objectContaining({bookingKind:"UNPAID",cardId:null,pointCost:0,customerId:"student"})});
 });
 it.each([["SESSION",1],["POINT",2]])("點名才選擇 %s 有效方案及正確扣抵額度",async(unit,cost)=>{
  const update=vi.fn(),tx={courseTemplate:{findFirst:vi.fn().mockResolvedValue({musicSubjectId:null})},$queryRaw:vi.fn().mockResolvedValue([{planId:"plan"}]),courseBooking:{findFirst:vi.fn().mockResolvedValue({id:"booking",storeId:actor.storeId,bookingKind:"UNPAID",cardId:null,requestKey:"sports-fixed:s:student",sessionId:"s",customerId:"student",session:{templateId:"template",pointCost:2,startsAt:series.startsAt}}),update},coursePointCard:{findMany:vi.fn().mockResolvedValue([{id:"card",unit,planId:"plan",templateIds:[],requestKey:"test-card",expiresAt:new Date("2099-12-31"),remaining:10,bookings:[]}])}};
  await bindSportsAttendanceCard(tx as unknown as Prisma.TransactionClient,actor,"booking");
  expect(update).toHaveBeenCalledWith({where:{id:"booking"},data:expect.objectContaining({cardId:"card",bookingKind:"CARD",pointCost:cost})});
 });
 it("其他預約保留後額度不足時不綁定課卡，讓整筆點名回退",async()=>{
  const update=vi.fn(),tx={courseTemplate:{findFirst:vi.fn().mockResolvedValue({musicSubjectId:null})},$queryRaw:vi.fn().mockResolvedValue([{planId:"plan"}]),courseBooking:{findFirst:vi.fn().mockResolvedValue({id:"b",bookingKind:"UNPAID",requestKey:"sports-fixed:s:p",cardId:null,customerId:"p",sessionId:"s",session:{pointCost:2,templateId:"t",startsAt:series.startsAt}}),update},coursePointCard:{findMany:vi.fn().mockResolvedValue([{id:"card",unit:"POINT",planId:"plan",templateIds:[],requestKey:"test-card",expiresAt:new Date("2099-12-31"),remaining:2,bookings:[{pointCost:1}]}])}};
  await expect(bindSportsAttendanceCard(tx as unknown as Prisma.TransactionClient,actor,"b")).rejects.toThrow("足額");expect(update).not.toHaveBeenCalled();
 });
 it("未開放運動固定課的店家拒絕寫入",async()=>{
  m.enabled=false;await expect(addSportsFixedLearners({} as Prisma.TransactionClient,actor,{id:"s",templateId:"t",startsAt:series.startsAt,endsAt:series.endsAt,pointCost:2,capacity:1},{perpetual:true,frequency:"WEEKLY",enrollment:"OPEN",planId:"p",students:[],trialPrice:0})).rejects.toThrow("尚未開放運動固定課");
 });
});
