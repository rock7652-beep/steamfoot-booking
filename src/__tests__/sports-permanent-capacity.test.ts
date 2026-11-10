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
it("allows assigned students beyond the legacy capacity without binding cards",async()=>{
 const tx=fixture();await addSportsFixedLearners(tx as unknown as Prisma.TransactionClient,actor,session,{...rule,students:[...rule.students,{customerId:"two",cardId:null}]});
 expect(tx.courseBooking.create).toHaveBeenCalledTimes(2);expect(tx.courseBooking.create).toHaveBeenCalledWith({data:expect.objectContaining({bookingKind:"UNPAID",cardId:null,pointCost:0})});
});
it("allows another assigned learner when the old one-seat count is occupied",async()=>{
 const tx=fixture(1);await addSportsFixedLearners(tx as unknown as Prisma.TransactionClient,actor,session,rule);expect(tx.courseBooking.create).toHaveBeenCalledOnce();
});
it("allows the final place without pre-deducting or binding a card",async()=>{
 const tx=fixture();await addSportsFixedLearners(tx as unknown as Prisma.TransactionClient,actor,session,rule);expect(tx.courseBooking.create).toHaveBeenCalledOnce();expect(tx.courseBooking.create).toHaveBeenCalledWith({data:expect.objectContaining({cardId:null,pointCost:0,bookingKind:"UNPAID"})});
});
it("keeps open enrollment empty",async()=>{
 const tx=fixture();await addSportsFixedLearners(tx as unknown as Prisma.TransactionClient,actor,session,{...rule,enrollment:"OPEN",students:[]});expect(tx.courseBooking.count).not.toHaveBeenCalled();expect(tx.courseBooking.create).not.toHaveBeenCalled();
});
it("still skips oversized OPEN series before creating a future session",async()=>{
 const series={...session,id:"series",storeId:actor.storeId,requestKey:"weekly",roomId:"room",coachId:"coach",frequency:"WEEKLY",untilDate:null,excludedDates:[],cancelledAt:null,learnerSnapshot:[{customerId:"one"},{customerId:"two"}]};
 const create=vi.fn(),query=vi.fn().mockResolvedValueOnce([series]).mockResolvedValueOnce([{payload:{...rule,enrollment:"OPEN"}}]);
 const tx={$queryRaw:query,courseSession:{findUnique:vi.fn().mockResolvedValue(null),create}};
 await expect(materializeSportsMonth(tx as unknown as Prisma.TransactionClient,actor,"2026-11-09","2026-11-09")).resolves.toMatch("已略過異常系列");expect(create).not.toHaveBeenCalled();
});

it("keeps mixed OPEN class capacity checks for new fixed learners",async()=>{
 const tx=fixture(1);await expect(addSportsFixedLearners(tx as unknown as Prisma.TransactionClient,actor,session,{...rule,enrollment:"OPEN"})).rejects.toThrow("超過人數上限");expect(tx.courseBooking.create).not.toHaveBeenCalled();
});
it("still rejects learner timetable collisions for assigned classes",async()=>{
 const tx=fixture(1);tx.courseBooking.findFirst.mockResolvedValueOnce({id:"collision"} as never);await expect(addSportsFixedLearners(tx as unknown as Prisma.TransactionClient,actor,session,rule)).rejects.toThrow("同時段");expect(tx.courseBooking.create).not.toHaveBeenCalled();
});
