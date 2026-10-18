import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({native:true}));
vi.mock("@/lib/sports-native-preview",()=>({sportsNativePreview:()=>m.native}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{}}));
vi.mock("@/lib/db",()=>({prisma:{}}));
import {sessionWaitlistPolicy} from "@/server/services/sports-session-waitlist";
import {sameSportsScheduleRule} from "@/lib/sports-staging-types";
import {rentalInput,sportsRentalInput} from "@/lib/course-rental";
import type {Prisma} from "../../generated/course-client";
const rule={frequency:"WEEKLY",enrollment:"OPEN",planId:"p",students:[],trialPrice:0,waitlist:{limit:2,stopMinutes:240}};
const fallback={waitlistEnabled:true,waitlistLimit:5,waitlistStopMinutes:60};
beforeEach(()=>{m.native=true;});
it("課次候補覆蓋不修改課程範本，0明確停用，指定學員不候補",async()=>{
 for(const [enrollment,limit,enabled] of [["OPEN",2,true],["OPEN",0,false],["ASSIGNED",2,false]] as const){
 const tx={$queryRaw:vi.fn().mockResolvedValue([{payload:{...rule,enrollment,waitlist:{limit,stopMinutes:240}}}])};
 expect(await sessionWaitlistPolicy(tx as unknown as Prisma.TransactionClient,"sports-live-flow-store","session",fallback)).toEqual({waitlistEnabled:enabled,waitlistLimit:limit,waitlistStopMinutes:240});
 expect(fallback.waitlistLimit).toBe(5);
 }
});
it("音樂及正式店不查Preview規則、舊課沿用原設定",async()=>{
 const tx={$queryRaw:vi.fn().mockResolvedValue([])};m.native=false;
 expect(await sessionWaitlistPolicy(tx as unknown as Prisma.TransactionClient,"music","session",fallback)).toBe(fallback);expect(tx.$queryRaw).not.toHaveBeenCalled();
 m.native=true;expect(await sessionWaitlistPolicy(tx as unknown as Prisma.TransactionClient,"sports-live-flow-store","old",fallback)).toBe(fallback);
});
it("同請求重送不得改寫候補名額或停止時間",()=>{
 expect(sameSportsScheduleRule(rule,{...rule})).toBe(true);
 expect(sameSportsScheduleRule(rule,{...rule,waitlist:{limit:3,stopMinutes:240}})).toBe(false);
 expect(sameSportsScheduleRule(rule,{...rule,waitlist:{limit:2,stopMinutes:0}})).toBe(false);
});
it("精確出租時間只在運動Preview schema放行，原出租限制保留",()=>{
 const rental={requestKey:"00000000-0000-4000-8000-000000000001",roomId:"room",customerName:"學員",customerPhone:"0900000000",date:"2026-12-01",time:"09:15",durationMinutes:45,amount:200};
 expect(sportsRentalInput.safeParse(rental).success).toBe(true);expect(rentalInput.safeParse(rental).success).toBe(false);
 expect(sportsRentalInput.safeParse({...rental,time:"25:00"}).success).toBe(false);
});
