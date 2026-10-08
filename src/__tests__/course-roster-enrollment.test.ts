import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({source:vi.fn(),sessions:vi.fn(),previous:vi.fn(),reserve:vi.fn(),manager:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/feature-gate",()=>({getStoreLimitsByStoreId:vi.fn().mockResolvedValue({maxMonthlyBookings:1000})}));
vi.mock("@/server/services/operation-audit",()=>({recordOperationAuditBestEffort:vi.fn()}));
vi.mock("@/server/services/course-booking",()=>({reserveCourseInTransaction:m.reserve}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager,courseTransaction:async(_store:string,run:(tx:unknown)=>unknown)=>run({courseSession:{findFirst:m.source,findMany:m.sessions},courseBooking:{findMany:m.previous}})}));
import {enrollCourseSeries,previewCourseEnrollment} from "@/server/actions/course-roster-enrollment";
const input={sessionId:"first",customerId:"student",cardId:"card",sessionIds:["first","second"],requestKey:"d81d61fc-60e4-4d45-b5a2-4d9d0968440a"};
beforeEach(()=>{
 vi.clearAllMocks();m.manager.mockResolvedValue({storeId:"store",user:{id:"manager",name:"店長"}});m.source.mockResolvedValue({id:"first",templateId:"template",requestKey:"series",startsAt:new Date("2099-01-01")});
 m.sessions.mockResolvedValue(["first","second"].map(id=>({id,startsAt:new Date("2099-01-01"),pointCost:2,capacity:1,bookings:[]})));m.previous.mockResolvedValue([]);m.reserve.mockResolvedValue({id:"booking"});
});
it("previews a store-scoped series and excludes students already in a lesson",async()=>{
 m.sessions.mockResolvedValue([{id:"first",startsAt:new Date("2099-01-01"),pointCost:2,capacity:1,bookings:[]},{id:"second",startsAt:new Date("2099-01-08"),pointCost:2,capacity:1,bookings:[{customerId:"student",status:"RESERVED"}]}]);
 const result=await previewCourseEnrollment(input);expect(result).toMatchObject({success:true,sessions:[{id:"first"}]});
 expect(m.sessions.mock.calls[0][0].where).toMatchObject({storeId:"store",requestKey:"series",cancelledAt:null,releasedAt:null,teacherAttendance:"SCHEDULED"});
});
it("checks the confirmed dates before reserving and rejects a stale scope",async()=>{
 const result=await enrollCourseSeries({...input,sessionIds:["first"]});expect(result.success).toBe(false);expect(m.reserve).not.toHaveBeenCalled();
});
it("reserves each lesson under the same transaction and replays without duplicate writes",async()=>{
 expect(await enrollCourseSeries(input)).toMatchObject({success:true,count:2});expect(m.reserve).toHaveBeenCalledTimes(2);
 expect(m.reserve.mock.calls[1][2]).toMatchObject({sessionId:"second",cardId:"card",requestKey:`${input.requestKey}:second`});
 m.previous.mockResolvedValue([{sessionId:"first"},{sessionId:"second"}]);
 expect(await enrollCourseSeries(input)).toMatchObject({success:true,count:2});expect(m.reserve).toHaveBeenCalledTimes(2);
});
it("propagates an unavailable lesson instead of reporting partial success",async()=>{
 m.reserve.mockRejectedValueOnce(new Error("額度不足"));expect((await enrollCourseSeries(input)).success).toBe(false);expect(m.reserve).toHaveBeenCalledTimes(1);
});

it.each([{bookingKind:"OPENING_MAKEUP"},{musicOpeningMakeupEntitlementId:"right"}])("rejects opening markers before ordinary series enrollment: %j",async marker=>{
 expect(await enrollCourseSeries({...input,...marker})).toMatchObject({success:false});expect(m.reserve).not.toHaveBeenCalled();
});
