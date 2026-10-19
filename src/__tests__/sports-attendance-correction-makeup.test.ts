import {beforeEach,expect,it,vi} from "vitest";
import type {Prisma} from "../../generated/course-client";
vi.mock("@/lib/feature-gate",()=>({getStoreLimitsByStoreId:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseTransaction:vi.fn()}));
const scope=vi.hoisted(()=>({enabled:true}));
vi.mock("@/lib/sports-native-preview",()=>({sportsNativePreview:()=>scope.enabled}));
import {correctCourseAttendance} from "@/server/services/course-booking";
const actor={storeId:"sports-live-flow-store",userId:"owner",name:"Owner"};
function fixture(status="ATTENDED"){
 const row={id:"b",sessionId:"s",customerId:"student",reserverCustomerId:null,requestKey:"sports-fixed:s:student",status,cardId:"card",pointCost:2,bookingKind:"CARD",session:{cancelledAt:null,teacherAttendance:"SCHEDULED",templateId:"t",startsAt:new Date("2026-11-02T01:00Z")},card:{remaining:6,closedAt:null,planId:"plan",unit:"POINT",termSessionIds:[]}};
 const tx={courseBooking:{findFirst:vi.fn().mockImplementation(async()=>row),aggregate:vi.fn().mockResolvedValue({_sum:{pointCost:0}}),count:vi.fn().mockResolvedValue(0),update:vi.fn().mockImplementation(async({data})=>Object.assign(row,data))},coursePointCard:{findUnique:vi.fn().mockResolvedValue(null),create:vi.fn().mockResolvedValue({id:"coupon"}),update:vi.fn().mockResolvedValue({id:"coupon"})},courseCardMember:{create:vi.fn()},coursePointEntry:{create:vi.fn()},courseSession:{findFirst:vi.fn().mockResolvedValue(null)}};
 return {row,tx,client:tx as unknown as Prisma.TransactionClient};
}
beforeEach(()=>{scope.enabled=true;});
it("出席更正曠課只建立一次永久補課權益，不再扣原方案",async()=>{
 const f=fixture();await correctCourseAttendance(f.client,actor,"b","NO_SHOW","ATTENDED");
 expect(f.tx.coursePointCard.create).toHaveBeenCalledWith({data:expect.objectContaining({requestKey:"no-show-makeup:b",remaining:2,nameSnapshot:"固定課待補課",expiresAt:expect.any(Date)})});
 expect(f.tx.coursePointCard.update).not.toHaveBeenCalled();expect(f.row.status).toBe("NO_SHOW");
 await correctCourseAttendance(f.client,actor,"b","NO_SHOW","NO_SHOW");expect(f.tx.coursePointCard.create).toHaveBeenCalledOnce();
});
it("已回收的補課券以同一筆重啟，不建立第二張",async()=>{
 const f=fixture();f.tx.coursePointCard.findUnique.mockResolvedValue({id:"coupon",remaining:0,closedAt:new Date()} as never);
 await correctCourseAttendance(f.client,actor,"b","NO_SHOW","ATTENDED");expect(f.tx.coursePointCard.create).not.toHaveBeenCalled();expect(f.tx.coursePointCard.update).toHaveBeenCalledWith({where:{id:"coupon"},data:expect.objectContaining({remaining:2,closedAt:null})});
});
it("曠課更正出席回收未使用的補課券，不二次扣堂",async()=>{
 const f=fixture("NO_SHOW");f.tx.coursePointCard.findUnique.mockResolvedValue({id:"coupon",remaining:2,closedAt:null} as never);
 await correctCourseAttendance(f.client,actor,"b","ATTENDED","NO_SHOW");expect(f.row.status).toBe("ATTENDED");expect(f.tx.coursePointCard.update).toHaveBeenCalledExactlyOnceWith({where:{id:"coupon"},data:{remaining:0,closedAt:expect.any(Date)}});expect(f.tx.coursePointCard.create).not.toHaveBeenCalled();
});
it("已使用或預約的補課券阻擋更正，保留原點名及額度",async()=>{
 const f=fixture("NO_SHOW");f.tx.coursePointCard.findUnique.mockResolvedValue({id:"coupon",remaining:2,closedAt:null} as never);f.tx.courseBooking.count.mockResolvedValue(1);
 await expect(correctCourseAttendance(f.client,actor,"b","ATTENDED","NO_SHOW")).rejects.toThrow("補課券已使用或預約");expect(f.tx.courseBooking.update).not.toHaveBeenCalled();expect(f.tx.coursePointCard.update).not.toHaveBeenCalled();expect(f.tx.coursePointEntry.create).not.toHaveBeenCalled();
});
it("過期的點名快照拒絕修改或發券",async()=>{
 const f=fixture("NO_SHOW");await expect(correctCourseAttendance(f.client,actor,"b","ATTENDED","ATTENDED")).rejects.toThrow("另一位人員");expect(f.tx.coursePointCard.create).not.toHaveBeenCalled();expect(f.tx.courseBooking.update).not.toHaveBeenCalled();
});
it("非運動Preview不套用固定課補課政策",async()=>{
 scope.enabled=false;const f=fixture();await correctCourseAttendance(f.client,actor,"b","NO_SHOW","ATTENDED");expect(f.tx.coursePointCard.create).not.toHaveBeenCalled();
});
