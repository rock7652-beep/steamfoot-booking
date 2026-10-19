import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({sessions:vi.fn(),source:vi.fn(),rules:vi.fn(),settle:vi.fn(),update:vi.fn(),raw:vi.fn(),waitlist:vi.fn(),enabled:true}));
vi.mock("@/lib/sports-native-preview",()=>({sportsNativePreview:()=>m.enabled}));
vi.mock("@/lib/db",()=>({prisma:{storeFeatureEntitlement:{findFirst:async()=>({})}}}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{courseSession:{findFirst:m.source,findMany:m.sessions}}}));
vi.mock("@/server/services/course-access",()=>({courseManager:async()=>({storeId:"sports-live-flow-store",user:{id:"owner",name:"老闆"}}),courseTransaction:async(_store:string,cb:(tx:unknown)=>unknown)=>cb({courseSession:{findMany:m.sessions,update:m.update},$executeRaw:m.raw})}));
vi.mock("@/server/services/sports-permanent-series",()=>({readSportsSeries:m.rules,ensureSportsMonth:vi.fn(),sportsLearners:{parse:(x:unknown)=>x}}));
vi.mock("@/server/services/course-booking",()=>({settleCourseBooking:m.settle,reserveCourseInTransaction:vi.fn()}));
vi.mock("@/server/services/course-waitlist",()=>({cancelCourseWaitlistForSession:m.waitlist}));
import {previewSportsCourseCancellation,stopSportsSeries} from "@/server/actions/sports-series";
beforeEach(()=>{vi.clearAllMocks();m.enabled=true;m.rules.mockResolvedValue([{id:"series",requestKey:"weekly",cancelledAt:null}]);m.source.mockResolvedValue({requestKey:"weekly",startsAt:new Date("2030-11-04T08:00:00Z"),bookings:[{id:"b",status:"RESERVED"}]});m.sessions.mockResolvedValue([{id:"s",bookings:[{id:"b",status:"RESERVED"}]}]);});
it("範圍預覽包含本堂及永久系列，提供名單快照",async()=>{
 const r=await previewSportsCourseCancellation("s");expect(r).toMatchObject({success:true,data:{effectiveDate:"2030-11-04",seriesId:"series",currentPeople:1,sessionIds:["s"],bookingIds:["b"],canStop:true}});expect(m.settle).not.toHaveBeenCalled();expect(m.raw).not.toHaveBeenCalled();
});
it("跨裝置名單變動拒絕停課，不能先取消部分課次",async()=>{
 const r=await stopSportsSeries({seriesId:"series",effectiveDate:"2030-11-04",expectedSessionIds:["s"],expectedBookingIds:[]});expect(r.success).toBe(false);expect(m.settle).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();expect(m.raw).not.toHaveBeenCalled();
});
it("出席或曠課未解除時不取消、不結束永久系列",async()=>{
 m.sessions.mockResolvedValue([{id:"s",bookings:[{id:"b",status:"NO_SHOW"}]}]);const r=await stopSportsSeries({seriesId:"series",effectiveDate:"2030-11-04",expectedSessionIds:["s"],expectedBookingIds:["b"]});expect(r.success).toBe(false);expect(m.settle).not.toHaveBeenCalled();expect(m.raw).not.toHaveBeenCalled();
});
it("確認快照後取消預約與候補，結束系列避免後續重生",async()=>{
 const r=await stopSportsSeries({seriesId:"series",effectiveDate:"2030-11-04",expectedSessionIds:["s"],expectedBookingIds:["b"]});expect(r.success).toBe(true);expect(m.settle).toHaveBeenCalledTimes(1);expect(m.waitlist).toHaveBeenCalledWith(expect.anything(),"sports-live-flow-store","s");expect(m.raw).toHaveBeenCalledTimes(1);
});
it("非運動 Preview 拒絕讀寫",async()=>{m.enabled=false;expect((await previewSportsCourseCancellation("s")).success).toBe(false);expect((await stopSportsSeries({seriesId:"series",effectiveDate:"2030-11-04"})).success).toBe(false);expect(m.sessions).not.toHaveBeenCalled();expect(m.raw).not.toHaveBeenCalled();});
