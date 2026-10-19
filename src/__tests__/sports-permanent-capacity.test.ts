import {beforeEach,expect,it,vi} from "vitest";
import type {Prisma} from "../../generated/course-client";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/sports-native-preview",()=>({sportsNativePreview:()=>true}));
vi.mock("@/lib/subscription-guard",()=>({assertStoreSubscriptionWritable:async()=>{}}));
import {addSportsFixedLearners,materializeSportsMonth} from "@/server/services/sports-permanent-series";
const actor={storeId:"sports-live-flow-store",userId:"owner",name:"Owner"};
const session={id:"s",templateId:"t",startsAt:new Date("2026-11-02T02:00Z"),endsAt:new Date("2026-11-02T03:00Z"),pointCost:1,capacity:1};
const rule={perpetual:true,frequency:"WEEKLY" as const,enrollment:"ASSIGNED" as const,planId:"p",students:[{customerId:"one",cardId:null}],trialPrice:0};
function fixture(occupied=0){return {$queryRaw:vi.fn().mockResolvedValue([{name:"Student"}]),courseBooking:{count:vi.fn().mockResolvedValue(occupied),findFirst:vi.fn().mockResolvedValue(null),create:vi.fn()}};}
beforeEach(()=>vi.clearAllMocks());
it("rejects assigned students over capacity before reading customers or creating bookings",async()=>{
 const tx=fixture();await expect(addSportsFixedLearners(tx as unknown as Prisma.TransactionClient,actor,session,{...rule,students:[...rule.students,{customerId:"two",cardId:null}]})).rejects.toThrow("超過人數上限");expect(tx.$queryRaw).not.toHaveBeenCalled();expect(tx.courseBooking.create).not.toHaveBeenCalled();
});
it("counts existing active bookings before assigning more students",async()=>{
 const tx=fixture(1);await expect(addSportsFixedLearners(tx as unknown as Prisma.TransactionClient,actor,session,rule)).rejects.toThrow("超過人數上限");expect(tx.courseBooking.count).toHaveBeenCalledWith({where:{storeId:actor.storeId,sessionId:"s",status:{not:"CANCELLED"}}});expect(tx.courseBooking.create).not.toHaveBeenCalled();
});
it("allows the final place without pre-deducting or binding a card",async()=>{
 const tx=fixture();await addSportsFixedLearners(tx as unknown as Prisma.TransactionClient,actor,session,rule);expect(tx.courseBooking.create).toHaveBeenCalledOnce();expect(tx.courseBooking.create).toHaveBeenCalledWith({data:expect.objectContaining({cardId:null,pointCost:0,bookingKind:"UNPAID"})});
});
it("keeps open enrollment empty",async()=>{
 const tx=fixture();await addSportsFixedLearners(tx as unknown as Prisma.TransactionClient,actor,session,{...rule,enrollment:"OPEN",students:[]});expect(tx.courseBooking.count).not.toHaveBeenCalled();expect(tx.courseBooking.create).not.toHaveBeenCalled();
});
it("skips a legacy oversized series before creating a future session",async()=>{
 const series={...session,id:"series",storeId:actor.storeId,requestKey:"weekly",roomId:"room",coachId:"coach",frequency:"WEEKLY",untilDate:null,excludedDates:[],cancelledAt:null,learnerSnapshot:[{customerId:"one"},{customerId:"two"}]};
 const create=vi.fn(),query=vi.fn().mockResolvedValueOnce([series]).mockResolvedValueOnce([{payload:rule}]);
 const tx={$queryRaw:query,courseSession:{findUnique:vi.fn().mockResolvedValue(null),create}};
 await expect(materializeSportsMonth(tx as unknown as Prisma.TransactionClient,actor,"2026-11-09","2026-11-09")).resolves.toMatch("已略過異常系列");expect(create).not.toHaveBeenCalled();
});
