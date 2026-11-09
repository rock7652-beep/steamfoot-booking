import {beforeEach,expect,it,vi} from "vitest";
import type {Prisma} from "../../generated/course-client";
const m=vi.hoisted(()=>({sports:true,rule:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseTransaction:vi.fn()}));
vi.mock("@/lib/feature-gate",()=>({getStoreLimitsByStoreId:vi.fn()}));
vi.mock("@/lib/shop-config",()=>({resolveCustomerBookingWindow:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{}}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{}}));
vi.mock("@/lib/sports-native-preview",()=>({sportsNativePreview:async()=>m.sports}));
vi.mock("@/server/services/sports-staging-schedule",()=>({readSportsSessionRule:m.rule}));
import {syncCourseRelease} from "@/server/services/course-booking";
beforeEach(()=>{m.sports=true;m.rule.mockResolvedValue({enrollment:"OPEN",payload:{students:[{customerId:"fixed"}]}});});
it.each(["sports","music"])("last fixed learner leaving keeps the public %s class available",async module=>{
 m.sports=module==="sports";
 const update=vi.fn();
 const tx={courseSession:{findFirst:vi.fn().mockResolvedValue({teacherAttendance:"PENDING",releasedAt:null,enrollmentMode:"OPEN",requestKey:"schedule"}),update},courseBooking:{count:vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1).mockResolvedValue(1)}};
 await syncCourseRelease(tx as unknown as Prisma.TransactionClient,"store","session");
 expect(update).not.toHaveBeenCalled();
});
it("teacher absence still releases a mixed class with no active learners",async()=>{
 const update=vi.fn();
 const tx={courseSession:{findFirst:vi.fn().mockResolvedValue({teacherAttendance:"LEAVE",releasedAt:null}),update},courseBooking:{count:vi.fn().mockResolvedValue(0)}};
 await syncCourseRelease(tx as unknown as Prisma.TransactionClient,"store","session");
 expect(update).toHaveBeenCalledWith({where:{id:"session"},data:{releasedAt:expect.any(Date)}});
});
