import {beforeEach,expect,it,vi} from "vitest";
import type {Prisma} from "../../generated/course-client";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({enabled:true,blocked:false,check:vi.fn(),assert:vi.fn(),sessions:vi.fn(),rules:vi.fn(),transaction:vi.fn()}));
vi.mock("@/lib/sports-native-preview",()=>({sportsNativePreview:()=>m.enabled}));
vi.mock("@/lib/subscription-guard",()=>({isStoreSubscriptionWriteBlocked:m.check,assertStoreSubscriptionWritable:m.assert}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{courseSession:{findMany:m.sessions},$queryRaw:m.rules}}));
vi.mock("@/server/services/course-access",()=>({courseTransaction:m.transaction}));
import {ensureSportsMonth,materializeSportsMonth} from "@/server/services/sports-permanent-series";
const actor={storeId:"sports-live-flow-store",userId:"owner",name:"Owner"};
beforeEach(()=>{vi.clearAllMocks();m.enabled=true;m.blocked=false;m.check.mockImplementation(async()=>m.blocked);m.assert.mockImplementation(async()=>{if(m.blocked)throw Error("subscription read-only");});m.sessions.mockResolvedValue([]);m.rules.mockResolvedValue([]);});
it("blocked calendar reads skip all automatic mutations without breaking historical reads",async()=>{
 m.blocked=true;
 await expect(ensureSportsMonth(actor,"2027-01-01","2027-01-31")).resolves.toBeUndefined();
 expect(m.check).toHaveBeenCalledWith(actor.storeId);expect(m.sessions).not.toHaveBeenCalled();expect(m.rules).not.toHaveBeenCalled();expect(m.transaction).not.toHaveBeenCalled();
});
it("active subscriptions still inspect the calendar for missing occurrences",async()=>{
 await ensureSportsMonth(actor,"2027-01-01","2027-01-31");
 expect(m.check).toHaveBeenCalledWith(actor.storeId);expect(m.sessions).toHaveBeenCalled();expect(m.rules).toHaveBeenCalled();
});
it("the materializer rejects a subscription blocked after the calendar precheck",async()=>{
 m.blocked=true;const query=vi.fn();
 await expect(materializeSportsMonth({$queryRaw:query} as unknown as Prisma.TransactionClient,actor,"2027-01-01","2027-01-31")).rejects.toThrow("subscription read-only");
 expect(m.assert).toHaveBeenCalledWith(actor.storeId);expect(query).not.toHaveBeenCalled();
});
it("active subscriptions can enter materialization",async()=>{
 const query=vi.fn().mockResolvedValue([]);
 await materializeSportsMonth({$queryRaw:query} as unknown as Prisma.TransactionClient,actor,"2027-01-01","2027-01-31");
 expect(m.assert).toHaveBeenCalledWith(actor.storeId);expect(query).toHaveBeenCalled();
});
it("other modules do not gain a new subscription dependency",async()=>{
 m.enabled=false;await ensureSportsMonth(actor,"2027-01-01","2027-01-31");await materializeSportsMonth({} as Prisma.TransactionClient,actor,"2027-01-01","2027-01-31");expect(m.check).not.toHaveBeenCalled();expect(m.assert).not.toHaveBeenCalled();
});
