import {expect,it,vi} from "vitest";
import type {Prisma} from "../../generated/course-client";
vi.mock("@/lib/sports-native-preview",()=>({sportsNativePreview:()=>true}));
import {assertSportsSeriesFree} from "@/server/services/sports-permanent-series";
const store="sports-live-flow-store";
const own={requestKey:"weekly",roomId:"room",coachId:"coach",startsAt:new Date("2026-11-02T01:00Z"),endsAt:new Date("2026-11-02T02:00Z"),frequency:"WEEKLY",untilDate:null,excludedDates:[],cancelledAt:null};
function fixture(rules=[own]){return {$queryRaw:vi.fn().mockResolvedValue(rules),courseSession:{findFirst:vi.fn().mockResolvedValue(null)}};}
const resources={roomId:"room",coachId:"coach"};
const range=(day:string)=>({startsAt:new Date(`${day}T01:00Z`),endsAt:new Date(`${day}T02:00Z`)});
it.each(["2026-11-09","2027-11-01"])("單次調課不可占用自身尚未產生的固定日期 %s",async day=>{
 const tx=fixture();await expect(assertSportsSeriesFree(tx as unknown as Prisma.TransactionClient,store,[range(day)],resources,"weekly",undefined,["2026-11-02"])).rejects.toThrow("持續固定課");
});
it("恢復自身原時段及調整原時段時長不會被自己的規則擋住",async()=>{
 const tx=fixture();await expect(assertSportsSeriesFree(tx as unknown as Prisma.TransactionClient,store,[range("2026-11-02")],resources,"weekly",undefined,["2026-11-02"])).resolves.toBeUndefined();
});
it("多週調課僅排除實際選定的原課次，未選後續仍占位",async()=>{
 const tx=fixture();await expect(assertSportsSeriesFree(tx as unknown as Prisma.TransactionClient,store,[range("2026-11-09")],resources,"weekly",undefined,["2026-11-02","2026-11-09"])).resolves.toBeUndefined();
 await expect(assertSportsSeriesFree(tx as unknown as Prisma.TransactionClient,store,[range("2026-11-16")],resources,"weekly",undefined,["2026-11-02","2026-11-09"])).rejects.toThrow("持續固定課");
});
it("隔週保留奇偶週，空週可排，下一固定週不可占用",async()=>{
 const tx=fixture([{...own,frequency:"BIWEEKLY"}]);await expect(assertSportsSeriesFree(tx as unknown as Prisma.TransactionClient,store,[range("2026-11-09")],resources,"weekly",undefined,["2026-11-02"])).resolves.toBeUndefined();
 await expect(assertSportsSeriesFree(tx as unknown as Prisma.TransactionClient,store,[range("2026-11-16")],resources,"weekly",undefined,["2026-11-02"])).rejects.toThrow("持續固定課");
});
it("他系列同空間固定課仍阻擋，不受本次排除日期影響",async()=>{
 const tx=fixture([{...own,requestKey:"other"}]);await expect(assertSportsSeriesFree(tx as unknown as Prisma.TransactionClient,store,[range("2026-11-02")],resources,"weekly",undefined,["2026-11-02"])).rejects.toThrow("持續固定課");
});
