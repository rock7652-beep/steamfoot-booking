import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/feature-gate",()=>({getStoreLimitsByStoreId:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseTransaction:vi.fn()}));
import { reserveCourseInTransaction } from "@/server/services/course-booking";
import type { Prisma } from "../../generated/course-client";
const actor={storeId:"music",userId:"manager",name:"店長"};
const input={sessionId:"new",cardId:"card",customerId:"student",requestKey:"request",makeupForBookingId:"leave"};
const startsAt=new Date("2090-01-02T10:00:00Z");
const source={id:"leave",session:{templateId:"private",startsAt:new Date("2090-01-01T10:00:00Z"),template:{classType:"PRIVATE"}}};
const m={courseBooking:{findUnique:vi.fn(),findFirst:vi.fn(),count:vi.fn(),aggregate:vi.fn(),create:vi.fn()},courseSession:{findFirst:vi.fn()},coursePointCard:{findFirst:vi.fn()},courseBookingRule:{findUnique:vi.fn()},coursePointEntry:{create:vi.fn()},$queryRaw:vi.fn(),$executeRaw:vi.fn()};
const tx=m as unknown as Prisma.TransactionClient;
beforeEach(()=>{
 vi.resetAllMocks();
 m.courseBooking.findUnique.mockResolvedValue(null);
 m.courseBooking.findFirst.mockImplementation(async ({where})=>where.id==="leave"?source:null);
 m.courseBooking.count.mockResolvedValue(0);
 m.courseBooking.aggregate.mockResolvedValue({_sum:{pointCost:0}});
 m.courseSession.findFirst.mockResolvedValue({id:"new",templateId:"private",startsAt,endsAt:new Date("2090-01-02T11:00:00Z"),capacity:1,template:{isActive:true,visibility:"PUBLIC"}});
 m.coursePointCard.findFirst.mockResolvedValue({id:"card",unit:"SESSION",members:[{customerId:"student"}],templateIds:["private"],remaining:1,expiresAt:new Date("2099-01-01")});
 m.$queryRaw.mockImplementation(async (strings:TemplateStringsArray)=>strings.join("").includes('"Customer"')?[{id:"student",name:"學員"}]:strings.join("").includes('"StoreFeatureEntitlement"')?[{featureKey:"business.music"}]:[{closed:false}]);
 m.courseBooking.create.mockImplementation(async ({data})=>({id:"makeup",...data}));
});
it("reserves the original card and records the leave link without deducting a lesson",async()=>{
 const result=await reserveCourseInTransaction(tx,actor,input,100);
 expect(result.makeupForBookingId).toBe("leave");expect(result.pointCost).toBe(1);
 expect(m.coursePointEntry.create.mock.calls[0][0].data.kind).toBe("RESERVE");
 expect(m.courseBooking.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:"leave",storeId:"music",customerId:"student",cardId:"card",absenceKind:"STUDENT_LEAVE"})}));
});
it("rejects a stale leave already assigned to another makeup",async()=>{
 m.courseBooking.findFirst.mockImplementation(async ({where})=>where.id==="leave"?source:{id:"used"});
 await expect(reserveCourseInTransaction(tx,actor,input,100)).rejects.toThrow("已安排補課");expect(m.courseBooking.create).not.toHaveBeenCalled();
});
it("rejects a source outside this store, learner or card",async()=>{
 m.courseBooking.findFirst.mockResolvedValue(null);
 await expect(reserveCourseInTransaction(tx,actor,input,100)).rejects.toThrow("原方案");expect(m.courseBooking.create).not.toHaveBeenCalled();
});
it("does not accept group leave or a different course",async()=>{
 m.courseBooking.findFirst.mockResolvedValue({...source,session:{...source.session,template:{classType:"GROUP"}}});
 await expect(reserveCourseInTransaction(tx,actor,input,100)).rejects.toThrow("原方案");
 m.courseBooking.findFirst.mockResolvedValue({...source,session:{...source.session,templateId:"other"}});
 await expect(reserveCourseInTransaction(tx,actor,input,100)).rejects.toThrow("原方案");
});
it("still enforces subscription quota for makeup",async()=>{
 m.courseBooking.count.mockResolvedValue(100);
 await expect(reserveCourseInTransaction(tx,actor,input,100)).rejects.toThrow("額度上限");expect(m.courseBooking.create).not.toHaveBeenCalled();
});
it("supports choosing no makeup and prevents reusing a request for a different leave",async()=>{
 await reserveCourseInTransaction(tx,actor,{...input,makeupForBookingId:null},100);
 expect(m.courseBooking.create.mock.calls[0][0].data.makeupForBookingId).toBeNull();
 m.courseBooking.findUnique.mockResolvedValue({...input,operatorUserId:actor.userId,makeupForBookingId:"other"});
 await expect(reserveCourseInTransaction(tx,actor,input,100)).rejects.toThrow("請求已使用");
});
