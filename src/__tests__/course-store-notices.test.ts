import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({rule:vi.fn(),find:vi.fn(),upsert:vi.fn(),raw:vi.fn(),manager:vi.fn(),read:vi.fn(),transaction:vi.fn(),update:vi.fn(),audit:vi.fn(),permission:vi.fn(),count:vi.fn(),list:vi.fn()}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{courseBookingRule:{findUnique:m.rule},courseStoreNotice:{count:m.count,findMany:m.list}}}));
vi.mock("@/lib/db",()=>({prisma:{}}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager,courseManagerRead:m.read,courseTransaction:m.transaction}));
vi.mock("@/lib/permissions",()=>({checkPermission:m.permission}));
vi.mock("@/server/services/operation-audit-outbox",()=>({enqueueOperationAudit:m.audit}));
import {recordCourseStoreNotice} from "@/server/services/course-store-notices";
import {loadCourseStoreNotices,markCourseStoreNotice,saveCourseOperationSwitch} from "@/server/actions/course-store-notices";
import {assertCourseSelfLeaveEnabled,assertCourseSelfRescheduleEnabled,assertCourseSelfBookingEnabled} from "@/server/services/course-self-booking";
const tx={courseBookingRule:{findUnique:m.rule,upsert:m.upsert},courseStoreNotice:{findUnique:m.find,findFirst:m.find,upsert:m.upsert,update:m.update},$queryRaw:m.raw};
const actor={storeId:"s",userId:"u",name:"小美",customerId:"c"};
const event={subjectKey:"booking:b",kind:"CANCEL" as const,customerName:"學員",courseName:"吉他",coachId:"t",startsAt:new Date("2099-01-01T10:00:00+08:00")};
beforeEach(()=>{vi.resetAllMocks();m.rule.mockResolvedValue({backendNoticesEnabled:true,selfLeaveEnabled:true,selfRescheduleEnabled:true});m.find.mockResolvedValue(null);m.raw.mockResolvedValue([{id:"t",displayName:"鈺君"}]);m.manager.mockResolvedValue({storeId:"s",user:{id:"u",name:"店員"}});m.transaction.mockImplementation(async(_s,work)=>work(tx));});
describe("independent course controls",()=>{
 it("allows leave and reschedule while new reservations are disabled",()=>{
  const rule={selfBookingEnabled:false,selfLeaveEnabled:true,selfRescheduleEnabled:true};
  expect(()=>assertCourseSelfBookingEnabled(rule)).toThrow();expect(()=>assertCourseSelfLeaveEnabled(rule)).not.toThrow();expect(()=>assertCourseSelfRescheduleEnabled(rule)).not.toThrow();
 });
 it("blocks each operation independently and preserves legacy behavior",()=>{
  expect(()=>assertCourseSelfLeaveEnabled({selfLeaveEnabled:false})).toThrow("請假請聯繫店家");
  expect(()=>assertCourseSelfRescheduleEnabled({selfBookingEnabled:true,selfRescheduleEnabled:false})).toThrow("改期請聯繫店家");
  expect(()=>assertCourseSelfRescheduleEnabled({selfBookingEnabled:false})).toThrow();
 });
 it("rejects stale store settings and writes only the selected switch",async()=>{
  expect(await saveCourseOperationSwitch({storeId:"other",key:"selfLeaveEnabled",enabled:false,previous:true})).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();
  expect(await saveCourseOperationSwitch({storeId:"s",key:"selfLeaveEnabled",enabled:false,previous:true})).toMatchObject({success:true,data:{enabled:false}});
  expect(m.upsert).toHaveBeenCalledWith({where:{storeId:"s"},create:{storeId:"s",selfLeaveEnabled:false},update:{selfLeaveEnabled:false}});
 });
});
describe("transactional store notices",()=>{
 it("does not write while explicitly disabled",async()=>{
  m.rule.mockResolvedValue({backendNoticesEnabled:false});await recordCourseStoreNotice(tx as never,actor,event);
  expect(m.upsert).not.toHaveBeenCalled();expect(m.raw).not.toHaveBeenCalled();
 });
 it("records notices by default when a store has no rule",async()=>{
  m.rule.mockResolvedValue(null);
  await recordCourseStoreNotice(tx as never,actor,event);
  expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({create:expect.objectContaining({storeId:"s",handledAt:null})}));
 });
 it("allows a store without a rule to disable the default-on setting",async()=>{
  m.rule.mockResolvedValue(null);
  expect(await saveCourseOperationSwitch({storeId:"s",key:"backendNoticesEnabled",enabled:false,previous:true})).toMatchObject({success:true,data:{enabled:false}});
  expect(m.upsert).toHaveBeenCalledWith({where:{storeId:"s"},create:{storeId:"s",backendNoticesEnabled:false},update:{backendNoticesEnabled:false}});
 });
 it("records student changes as pending and ordinary bookings as informational",async()=>{
  await recordCourseStoreNotice(tx as never,actor,event);
  expect(m.upsert).toHaveBeenLastCalledWith(expect.objectContaining({create:expect.objectContaining({storeId:"s",handledAt:null,coachName:"鈺君"})}));
  await recordCourseStoreNotice(tx as never,actor,{...event,kind:"BOOKING"});
  expect(m.upsert).toHaveBeenLastCalledWith(expect.objectContaining({create:expect.objectContaining({handledById:"u",handledAt:expect.any(Date)})}));
 });
 it("makes a member's same-day booking pending using Taiwan's business date",async()=>{
  vi.useFakeTimers();
  try {
   vi.setSystemTime(new Date("2026-10-29T16:05:00Z"));
   await recordCourseStoreNotice(tx as never,actor,{...event,kind:"BOOKING",startsAt:new Date("2026-10-30T11:00:00+08:00")});
   expect(m.upsert).toHaveBeenLastCalledWith(expect.objectContaining({create:expect.objectContaining({handledAt:null,handledById:null})}));
   await recordCourseStoreNotice(tx as never,actor,{...event,kind:"BOOKING",startsAt:new Date("2026-10-31T11:00:00+08:00")});
   expect(m.upsert).toHaveBeenLastCalledWith(expect.objectContaining({create:expect.objectContaining({handledAt:expect.any(Date)})}));
  } finally { vi.useRealTimers(); }
 });
 it("keeps staff leave followup pending and restores without stale pending state",async()=>{
  const staff={...actor,customerId:undefined};await recordCourseStoreNotice(tx as never,staff,{...event,kind:"LEAVE"});
  expect(m.upsert).toHaveBeenLastCalledWith(expect.objectContaining({create:expect.objectContaining({handledAt:null})}));
  await recordCourseStoreNotice(tx as never,staff,{...event,kind:"RESTORE"});
  expect(m.upsert).toHaveBeenLastCalledWith(expect.objectContaining({update:expect.objectContaining({handledById:"u",handledAt:expect.any(Date),revision:{increment:1}})}));
 });
 it("requires permission, current store and current revision before O",async()=>{
  const input={storeId:"s",id:"n",handled:true,revision:1};
  m.manager.mockRejectedValueOnce(new Error("permission denied"));expect(await markCourseStoreNotice(input)).toMatchObject({success:false});expect(m.update).not.toHaveBeenCalled();
  expect(await markCourseStoreNotice({...input,storeId:"other"})).toMatchObject({success:false});
  m.find.mockResolvedValue({id:"n",revision:2});expect(await markCourseStoreNotice(input)).toMatchObject({success:false});expect(m.update).not.toHaveBeenCalled();
 });
 it("O changes only notice state and returns a versioned receipt",async()=>{
  m.find.mockResolvedValue({id:"n",revision:1});m.update.mockResolvedValue({revision:2,handledAt:new Date("2026-10-11"),handledByName:"店員"});
  expect(await markCourseStoreNotice({storeId:"s",id:"n",handled:true,revision:1})).toMatchObject({success:true,storeId:"s",data:{revision:2}});
  expect(m.update).toHaveBeenCalledWith({where:{id:"n"},data:{handledAt:expect.any(Date),handledById:"u",handledByName:"店員",revision:{increment:1}}});
  expect(m.audit).toHaveBeenCalledTimes(1);
 });
});

it('reads a scoped summary without listing customer snapshots or checking write permission',async()=>{
 m.read.mockResolvedValue({storeId:'s',user:{role:'OWNER'}});m.count.mockResolvedValue(4);
 expect(await loadCourseStoreNotices({storeId:'s',handled:false,summaryOnly:true})).toMatchObject({success:true,enabled:true,count:4,items:[],canHandle:false});
 expect(m.list).not.toHaveBeenCalled();expect(m.permission).not.toHaveBeenCalled();expect(m.count).toHaveBeenCalledWith({where:{storeId:'s',handledAt:null}});
 expect(await loadCourseStoreNotices({storeId:'other',handled:false,summaryOnly:true})).toMatchObject({success:false});expect(m.count).toHaveBeenCalledTimes(1);
 m.rule.mockResolvedValue({backendNoticesEnabled:false});expect(await loadCourseStoreNotices({storeId:'s',handled:false,summaryOnly:true})).toMatchObject({success:true,enabled:false,count:0});expect(m.count).toHaveBeenCalledTimes(1);
});
