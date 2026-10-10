import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({waitlist:vi.fn(),selfBooking:vi.fn(),room:vi.fn(),template:vi.fn(),plan:vi.fn(),section:vi.fn(),shop:vi.fn()}));
vi.mock("@/server/actions/course",()=>({saveCourseTemplateSettings:m.template,saveCourseRoomSettings:m.room}));
vi.mock("@/server/actions/course-members",()=>({saveCoursePointPlan:m.plan}));
vi.mock("@/server/actions/course-settings",()=>({saveCourseSettingsSection:m.section,saveCourseSelfBookingSettings:m.selfBooking}));
vi.mock("@/server/services/shop-settings-save",()=>({saveShopSettings:m.shop}));
vi.mock("@/server/actions/course-waitlist",()=>({saveCourseWaitlistSettings:m.waitlist}));
import {POST as selfBooking} from "@/app/api/course/settings/self-booking/route";
import {POST as waitlist} from "@/app/api/course/settings/waitlist/route";
import {POST as room} from "@/app/api/course/settings/room/route";
import {POST as template} from "@/app/api/course/settings/template/route";
import {POST as plan} from "@/app/api/course/settings/plan/route";
import {POST as section} from "@/app/api/course/settings/section/route";
import {POST as shop} from "@/app/api/settings/save/route";
const receipt={expectedStoreId:"store",requestKey:"123e4567-e89b-42d3-a456-426614174000"};
const cases=[{route:selfBooking,save:m.selfBooking,values:{enabled:false,expectedRevision:0,...receipt}},{route:waitlist,save:m.waitlist,values:{enabled:true,defaultLimit:5,autoPromoteStopMinutes:240,expectedRevision:"{}",...receipt}},{route:room,save:m.room,values:{id:"room",name:"教室",expectedRevision:"{}",...receipt}},{route:template,save:m.template,values:{name:"瑜珈",durationMinutes:60,pointCost:1,capacity:10,...receipt}},{route:plan,save:m.plan,values:{name:"十堂",points:10,price:1000,validDays:90,...receipt}},{route:section,save:m.section,values:{values:{section:"booking",bookingLeadMinutes:0,cancellationLeadMinutes:0},expectedRevision:"{}",...receipt}},{route:shop,save:m.shop,values:{kind:"PAYMENT",values:{bankName:null,bankCode:null,bankAccountNumber:null,lineOfficialId:null,lineOfficialUrl:null},expectedRevision:"{}",...receipt}}];
const request=(body:unknown,origin="https://test.example")=>new Request("https://test.example/api/save",{method:"POST",headers:{origin},body:JSON.stringify(body)});
beforeEach(()=>vi.clearAllMocks());
it.each(cases)("rejects cross-origin and incomplete edits before the save",async({route,save,values})=>{
 expect((await route(request(values,"https://other.example"))).status).toBe(403);
 expect((await route(request({id:"edit",...receipt}))).status).toBe(400);expect(save).not.toHaveBeenCalled();
});
it.each(cases)("returns an uncached confirmed receipt or an ambiguous 503",async({route,save,values})=>{
 save.mockResolvedValueOnce({success:true,storeId:"store",data:{id:"row"}});
 const reply=await route(request(values));expect(reply.status).toBe(200);expect(reply.headers.get("cache-control")).toBe("private, no-store");expect(await reply.json()).toMatchObject({success:true,storeId:"store"});
 save.mockRejectedValueOnce(new Error("response interrupted"));const uncertain=await route(request(values));expect(uncertain.status).toBe(503);expect(await uncertain.json()).toMatchObject({success:false,uncertain:true});
});
