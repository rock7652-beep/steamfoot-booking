import {beforeEach,expect,it,vi} from "vitest";
import {AppError} from "@/lib/errors";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({query:vi.fn(),count:vi.fn(),create:vi.fn(),transaction:vi.fn()}));
vi.mock("@/lib/sports-native-preview",()=>({sportsNativePreview:()=>true}));
vi.mock("@/lib/subscription-guard",()=>({isStoreSubscriptionWriteBlocked:async()=>false,assertStoreSubscriptionWritable:async()=>{}}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{$queryRaw:m.query,courseSession:{findMany:async()=>[],count:m.count}}}));
vi.mock("@/server/services/course-access",()=>({courseTransaction:m.transaction}));
import {ensureSportsMonth} from "@/server/services/sports-permanent-series";
const actor={storeId:"sports-live-flow-store",userId:"owner",name:"Owner"};
const series={id:"series",storeId:actor.storeId,requestKey:"weekly",templateId:"template",roomId:"room",coachId:"coach",startsAt:new Date("2026-11-02T02:00Z"),endsAt:new Date("2026-11-02T03:00Z"),capacity:1,frequency:"WEEKLY",untilDate:null,excludedDates:[],cancelledAt:null,learnerSnapshot:[{customerId:"one"},{customerId:"two"}]};
const rule={perpetual:true,frequency:"WEEKLY",enrollment:"ASSIGNED",planId:"p",students:[],trialPrice:0};
beforeEach(()=>{vi.clearAllMocks();m.query.mockResolvedValue([series]);m.count.mockResolvedValue(0);m.transaction.mockImplementation(async(_store,callback)=>callback({$queryRaw:vi.fn().mockResolvedValueOnce([series]).mockResolvedValueOnce([{payload:rule}]),courseSession:{findUnique:async()=>null,create:m.create}}));});
it("returns a nonblocking warning only after the oversized expansion is rejected",async()=>{
 await expect(ensureSportsMonth(actor,"2026-11-09","2026-11-09")).resolves.toMatch("既有課表仍可查看");
 expect(m.transaction).toHaveBeenCalledOnce();expect(m.create).not.toHaveBeenCalled();
});
it.each([new AppError("FORBIDDEN","permission"),new AppError("VALIDATION","other validation"),new AppError("CONFLICT","resource collision"),new Error("database unavailable")])("does not disguise other failures: %s",async(error)=>{
 m.transaction.mockRejectedValueOnce(error);
 await expect(ensureSportsMonth(actor,"2026-11-09","2026-11-09")).rejects.toBe(error);
});
it("does not warn or write when every occurrence already exists",async()=>{
 m.count.mockResolvedValue(1);
 await expect(ensureSportsMonth(actor,"2026-11-09","2026-11-09")).resolves.toBeUndefined();expect(m.transaction).not.toHaveBeenCalled();
});
