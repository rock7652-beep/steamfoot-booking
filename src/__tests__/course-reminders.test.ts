import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/server/services/course-expiry-reminders",()=>({runCourseExpiryReminders:vi.fn(async()=>({total:0,sent:0,skipped:0,failed:0}))}));
const m = vi.hoisted(() => ({ rules:vi.fn(),store:vi.fn(),bookings:vi.fn(),customers:vi.fn(),feature:vi.fn(),plan:vi.fn(),limit:vi.fn(),blocked:vi.fn(),recipient:vi.fn(),route:vi.fn(),push:vi.fn(),central:vi.fn(),raw:vi.fn(),existing:vi.fn(),upsert:vi.fn(),update:vi.fn(),count:vi.fn(),currentRule:vi.fn(),manager:vi.fn(),requireFeature:vi.fn(),template:vi.fn(),ruleUpsert:vi.fn() }));
vi.mock("@/lib/db",()=>({prisma:{store:{findFirst:m.store},customer:{findMany:m.customers},reminderRule:{findMany:m.rules,findFirst:m.currentRule},$transaction:async(fn: (tx:unknown)=>unknown)=>fn({$queryRaw:m.raw,messageLog:{findUnique:m.existing,upsert:m.upsert,update:m.update,count:m.count},reminderRule:{findFirst:m.currentRule,upsert:m.ruleUpsert},messageTemplate:{upsert:m.template}})}}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{courseBooking:{findMany:m.bookings}}}));
vi.mock("@/lib/base-url",()=>({deriveBaseUrl:()=>"https://example.test"}));
vi.mock("@/lib/feature-gate",()=>({hasStoreFeature:m.feature,requireStoreFeature:m.requireFeature}));
vi.mock("@/lib/usage-gate",()=>({checkReminderSendLimit:m.limit}));
vi.mock("@/lib/store-plan",()=>({getStoreForPlanByStoreId:m.plan}));
vi.mock("@/lib/runtime-env",()=>({isPreviewExternalIntegrationBlocked:m.blocked}));
vi.mock("@/lib/line",()=>({pushMessage:m.push,pushSteamButlerMessage:m.central}));
vi.mock("@/server/services/central-line-recipient-loader",()=>({resolveCentralLineRecipientForCustomer:m.recipient}));
vi.mock("@/server/services/verified-reminder-line-route",()=>({resolveVerifiedReminderLineRoute:m.route}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
import {getCourseReminderCandidates,runCourseReminders} from "@/server/services/course-reminders";
import {saveCourseReminderBody,setCourseReminderEnabled,setCourseExpiryReminderEnabled} from "@/server/actions/course-reminders";
const now=new Date("2026-09-17T18:00:00+08:00");
beforeEach(()=>{
 vi.resetAllMocks();m.rules.mockResolvedValue([{id:"rule",storeId:"s",templateId:"template",template:{body:"請準時"}}]);m.store.mockResolvedValue({id:"s",slug:"course",name:"課程店"});
 m.bookings.mockResolvedValue([{id:"booking",customerId:"B",bookedByCustomerId:"A",session:{startsAt:new Date("2026-09-18T10:00:00+08:00"),endsAt:new Date("2026-09-18T11:00:00+08:00"),nameSnapshot:"瑜伽"}}]);m.customers.mockResolvedValue([{id:"B",name:"上課者 B",lineUserId:"line-b"}]);m.feature.mockResolvedValue(true);m.limit.mockReturnValue({allowed:true});m.plan.mockResolvedValue({});m.raw.mockResolvedValue([{id:"s"}]);m.currentRule.mockResolvedValue({id:"rule"});m.existing.mockResolvedValue(null);m.count.mockResolvedValue(0);m.blocked.mockReturnValue(false);m.route.mockResolvedValue({channel:"STORE",recipientLineUserId:"verified-b",status:"READY"});m.push.mockResolvedValue({success:true});m.central.mockResolvedValue({success:true});m.manager.mockResolvedValue({storeId:"s"});
});
it("selects only tomorrow's reserved classes and actual attendees in the course store",async()=>{
 await getCourseReminderCandidates("s",now);
 expect(m.store).toHaveBeenCalledWith(expect.objectContaining({where:{id:"s",industryModule:"COURSE"}}));
 expect(m.bookings).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({storeId:"s",status:"RESERVED",session:expect.objectContaining({storeId:"s",cancelledAt:null,startsAt:{gte:new Date("2026-09-17T16:00:00Z"),lte:new Date("2026-09-18T15:59:59.999Z")}})})}));
 expect(m.customers).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({storeId:"s",id:{in:["B"]}})}));
});
it("sends to verified attendee B with course deep link and stable retry key, never proxy A",async()=>{
 expect(await runCourseReminders(now,"s")).toMatchObject({sent:1,failed:0});
 expect(m.recipient).toHaveBeenCalledWith("B","s");
 const [store,recipient,messages,key]=m.push.mock.calls[0];expect(store).toBe("s");expect(recipient).toBe("verified-b");expect(key).toMatch(/^[a-f0-9-]{36}$/);
 expect(JSON.stringify(messages)).toContain("view=bookings");expect(JSON.stringify(messages)).toContain("date=2026-09-18");expect(JSON.stringify(messages)).not.toContain("/reschedule");expect(JSON.stringify(messages)).not.toContain("/cancel");
 await runCourseReminders(now,"s");expect(m.push.mock.calls[1][3]).toBe(key);
 expect(m.upsert.mock.calls[0][0].create).toMatchObject({customerId:"B",courseBookingId:"booking",storeId:"s"});
});
it("never sends again after a SENT log, even on replay",async()=>{
 m.existing.mockResolvedValue({status:"SENT"});expect(await runCourseReminders(now)).toMatchObject({sent:0,skipped:1});expect(m.push).not.toHaveBeenCalled();expect(m.upsert).not.toHaveBeenCalled();
});
it("rechecks cancellation under the store lock before recording or sending",async()=>{
 m.raw.mockResolvedValueOnce([{id:"s"}]).mockResolvedValueOnce([]);await runCourseReminders(now);expect(m.push).not.toHaveBeenCalled();expect(m.upsert).not.toHaveBeenCalled();
});
it("rechecks a disabled rule before sending",async()=>{
 m.currentRule.mockResolvedValue(null);await runCourseReminders(now);expect(m.push).not.toHaveBeenCalled();
});
it("records preview suppression without resolving recipients or sending externally",async()=>{
 m.blocked.mockReturnValue(true);expect(await runCourseReminders(now)).toMatchObject({skipped:1});expect(m.recipient).not.toHaveBeenCalled();expect(m.push).not.toHaveBeenCalled();expect(m.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"SKIPPED",errorMessage:expect.stringContaining("隔離預覽")})}));
});
it("respects existing feature and monthly quota limits",async()=>{
 m.feature.mockResolvedValue(false);await runCourseReminders(now);expect(m.bookings).not.toHaveBeenCalled();m.feature.mockResolvedValue(true);m.limit.mockReturnValue({allowed:false});await runCourseReminders(now);expect(m.push).not.toHaveBeenCalled();
});
it("does not guess a recipient when verified routing is blocked",async()=>{
 m.route.mockResolvedValue({status:"BLOCKED",reason:"mismatch"});await runCourseReminders(now);expect(m.push).not.toHaveBeenCalled();expect(m.central).not.toHaveBeenCalled();
});
it("central channel carries the same idempotency key",async()=>{
 m.route.mockResolvedValue({status:"READY",channel:"CENTRAL",recipientLineUserId:"central-b"});await runCourseReminders(now);expect(m.central).toHaveBeenCalledWith("central-b",expect.any(Array),expect.stringMatching(/^[a-f0-9-]{36}$/));expect(m.push).not.toHaveBeenCalled();
});
it("saving content does not opt the store into sending; authorization is checked",async()=>{
 expect(await saveCourseReminderBody({body:"提醒內容"})).toMatchObject({success:true});expect(m.manager).toHaveBeenCalledWith("business_hours.manage");expect(m.requireFeature).toHaveBeenCalled();expect(m.ruleUpsert.mock.calls[0][0]).toMatchObject({create:{storeId:"s",isEnabled:false},update:{}});
 m.manager.mockRejectedValue(new Error("denied"));expect(await setCourseReminderEnabled(true)).toMatchObject({success:false});expect(m.ruleUpsert).toHaveBeenCalledTimes(1);
});
it("failed LINE delivery remains FAILED rather than reporting sent",async()=>{
 m.push.mockResolvedValue({success:false,error:"timeout"});expect(await runCourseReminders(now)).toMatchObject({failed:1,sent:0});expect(m.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"FAILED",sentAt:null})}));
});

it("course expiry opt-in is scoped and permission checked without changing legacy settings",async()=>{
 expect(await setCourseExpiryReminderEnabled(true)).toMatchObject({success:true});
 expect(m.manager).toHaveBeenCalledWith("business_hours.manage");
 expect(m.template).toHaveBeenCalledWith(expect.objectContaining({where:{id:"course-expiry-reminder-enabled:s"},create:expect.objectContaining({storeId:"s",body:"enabled"})}));
 m.manager.mockRejectedValue(new Error("denied"));expect(await setCourseExpiryReminderEnabled(false)).toMatchObject({success:false});expect(m.template).toHaveBeenCalledTimes(1);
});
