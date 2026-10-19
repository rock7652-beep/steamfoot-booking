import {beforeEach,expect,it,vi} from "vitest";
import type {Prisma} from "../../generated/course-client";
import {AppError} from "@/lib/errors";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/sports-native-preview",()=>({sportsNativePreview:()=>true}));
vi.mock("@/lib/subscription-guard",()=>({assertStoreSubscriptionWritable:async()=>{}}));
vi.mock("@/server/services/sports-staging-schedule",()=>({attachSportsSessionRules:vi.fn()}));
import {materializeSportsMonth} from "@/server/services/sports-permanent-series";
import {attachSportsSessionRules} from "@/server/services/sports-staging-schedule";
const actor={storeId:"sports-live-flow-store",userId:"owner",name:"Owner"};
const base={storeId:actor.storeId,templateId:"template",roomId:"room",coachId:"coach",startsAt:new Date("2026-11-02T02:00Z"),endsAt:new Date("2026-11-02T03:00Z"),capacity:1,frequency:"WEEKLY",untilDate:null,excludedDates:[],cancelledAt:null,pointCost:1,createdById:"owner"};
const good={...base,id:"good",requestKey:"good",learnerSnapshot:[]};
const bad={...base,id:"bad",requestKey:"bad",startsAt:new Date("2026-11-02T05:00Z"),endsAt:new Date("2026-11-02T06:00Z"),learnerSnapshot:[{customerId:"one"},{customerId:"two"}]};
const rule={perpetual:true,frequency:"WEEKLY",enrollment:"OPEN",planId:"p",students:[],trialPrice:0};
function fixture(rules:typeof good[]){
 const create=vi.fn().mockImplementation(async({data})=>({id:data.requestKey+data.requestIndex,...data}));
 const query=vi.fn().mockImplementation(async(parts:TemplateStringsArray)=>parts.join("").includes("SELECT r.payload")?[{payload:rule}]:rules);
 return {$queryRaw:query,courseSession:{findUnique:vi.fn().mockResolvedValue(null),findFirst:vi.fn().mockResolvedValue(null),findMany:vi.fn().mockResolvedValue([]),create},courseRental:{findFirst:vi.fn().mockResolvedValue(null)}};
}
beforeEach(()=>vi.clearAllMocks());
it.each(["normal-first","normal-last"])("only skips the oversized series: %s",async(order)=>{
 const tx=fixture((order==="normal-first"?[good,bad]:[bad,good]) as typeof good[]);
 await expect(materializeSportsMonth(tx as unknown as Prisma.TransactionClient,actor,"2026-11-09","2026-11-16")).resolves.toMatch("已略過異常系列");
 expect(tx.courseSession.create).toHaveBeenCalledTimes(2);
 for(const [input]of tx.courseSession.create.mock.calls)expect(input.data.requestKey).toBe("good");
 expect(attachSportsSessionRules).toHaveBeenCalledTimes(2);
});
it("keeps normal-only expansion free of capacity warnings",async()=>{
 const tx=fixture([good]);await expect(materializeSportsMonth(tx as unknown as Prisma.TransactionClient,actor,"2026-11-09","2026-11-09")).resolves.toBeUndefined();expect(tx.courseSession.create).toHaveBeenCalledOnce();
});
it("uses each occurrence's effective learner roster, including stop dates",async()=>{
 const tx=fixture([{...bad,learnerSnapshot:[{customerId:"one"},{customerId:"two",stopDate:"2026-11-09"}]}] as unknown as typeof good[]);
 await expect(materializeSportsMonth(tx as unknown as Prisma.TransactionClient,actor,"2026-11-09","2026-11-09")).resolves.toBeUndefined();expect(tx.courseSession.create).toHaveBeenCalledOnce();expect(attachSportsSessionRules).toHaveBeenCalledWith(expect.anything(),actor,"bad",expect.objectContaining({students:[{customerId:"one",cardId:null}]}),expect.anything());
});
it.each([new AppError("FORBIDDEN","permission"),new AppError("VALIDATION","other validation"),new AppError("CONFLICT","collision"),new Error("database unavailable")])("does not swallow non-capacity preflight errors: %s",async(error)=>{
 const tx=fixture([good]);tx.courseSession.findUnique.mockRejectedValueOnce(error);
 await expect(materializeSportsMonth(tx as unknown as Prisma.TransactionClient,actor,"2026-11-09","2026-11-09")).rejects.toBe(error);expect(tx.courseSession.create).not.toHaveBeenCalled();
});
it("still rejects a real room/coach conflict instead of skipping it",async()=>{
 const tx=fixture([good]);tx.courseSession.findFirst.mockResolvedValueOnce({id:"occupied"} as never);
 await expect(materializeSportsMonth(tx as unknown as Prisma.TransactionClient,actor,"2026-11-09","2026-11-09")).rejects.toThrow("時段有衝突");expect(tx.courseSession.create).not.toHaveBeenCalled();
});
