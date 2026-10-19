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

// Evaluate the Prisma predicate against records, rather than returning a
// preselected exception: these cases catch accidental whole-new-class bounds.
type Row = Record<string, unknown>;
function matches(row: Row, where: Row): boolean {
 return Object.entries(where).every(([key, condition]) => {
  if (key === "OR") return (condition as Row[]).some(branch => matches(row, branch));
  const value = row[key];
  if (condition instanceof Date) return value instanceof Date && +value === +condition;
  if (condition && typeof condition === "object") {
   const filter = condition as Row;
   if ("not" in filter) return value !== filter.not;
   if (!(value instanceof Date)) return false;
   return (!("lte" in filter) || +value <= +(filter.lte as Date)) &&
    (!("gte" in filter) || +value >= +(filter.gte as Date)) &&
    (!("lt" in filter) || +value < +(filter.lt as Date)) &&
    (!("gt" in filter) || +value > +(filter.gt as Date));
  }
  return value === condition;
 });
}
const at = (time: string, day = "2026-11-02") => new Date(`${day}T${time}:00+08:00`);
const freed = (day = "2026-11-02", overrides: Row = {}): Row => ({
 id: "released", storeId: store, requestKey: "weekly", roomId: "room", coachId: "coach",
 startsAt: at("09:00", day), endsAt: at("10:00", day),
 releasedAt: at("08:00", day), cancelledAt: null,
 rescheduledFromStartsAt: null, rescheduledFromEndsAt: null, ...overrides,
});
function recordsFixture(rows: Row[], rules = [own]) {
 return {$queryRaw: vi.fn().mockResolvedValue(rules),
  courseSession: {findFirst: vi.fn(async ({where}: {where: Row}) => rows.find(row => matches(row, where)) ?? null)},
  courseRental: {findFirst: vi.fn().mockResolvedValue(null)}};
}
it.each([["09:00", "11:00"], ["08:30", "09:30"], ["09:30", "10:30"], ["09:15", "09:45"]])(
 "當次09–10釋放後可排 %s–%s，其他空閒時間不須被原課涵蓋", async (start, end) => {
  const tx = recordsFixture([freed()]);
  await expect(assertSportsSeriesFree(tx as unknown as Prisma.TransactionClient, store,
   [{startsAt: at(start), endsAt: at(end)}], resources)).resolves.toBeUndefined();
 });
it("調課後的原位置也可排較長新課", async () => {
 const tx = recordsFixture([freed("2026-11-02", {startsAt: at("13:00"), endsAt: at("14:00"), releasedAt: null,
  rescheduledFromStartsAt: at("09:00"), rescheduledFromEndsAt: at("10:00")})]);
 await expect(assertSportsSeriesFree(tx as unknown as Prisma.TransactionClient, store,
  [{startsAt: at("08:30"), endsAt: at("10:30")}], resources)).resolves.toBeUndefined();
});
it.each([
 ["未釋放的原課", freed("2026-11-02", {releasedAt: null})],
 ["其他店家", freed("2026-11-02", {storeId: "another-store"})],
 ["其他系列", freed("2026-11-02", {requestKey: "other"})],
 ["其他固定日期", freed("2026-11-09")],
 ["同日其他時段", freed("2026-11-02", {startsAt: at("11:00"), endsAt: at("12:00")})],
])("%s不能當作本次固定課的釋放例外", async (_label, row) => {
 const tx = recordsFixture([row]);
 await expect(assertSportsSeriesFree(tx as unknown as Prisma.TransactionClient, store,
  [{startsAt: at("09:00"), endsAt: at("11:00")}], resources)).rejects.toThrow("持續固定課");
});
it("新課跨多個固定日期時，每一堂都必須已釋放", async () => {
 const proposed = [{startsAt: at("09:00"), endsAt: at("11:00", "2026-11-09")}];
 await expect(assertSportsSeriesFree(recordsFixture([freed()]) as unknown as Prisma.TransactionClient,
  store, proposed, resources)).rejects.toThrow("持續固定課");
 await expect(assertSportsSeriesFree(recordsFixture([freed(), freed("2026-11-09")]) as unknown as Prisma.TransactionClient,
  store, proposed, resources)).resolves.toBeUndefined();
});
it("原課釋放不放寬新永久系列，後續每週仍保留", async () => {
 const tx = {...recordsFixture([freed()]), courseSession: {findMany: vi.fn().mockResolvedValue([])},
  courseRental: {findMany: vi.fn().mockResolvedValue([])}};
 await expect(assertSportsSeriesFree(tx as unknown as Prisma.TransactionClient, store,
  [{startsAt: at("09:00"), endsAt: at("11:00")}], resources, "new-series", "WEEKLY")).rejects.toThrow("固定時段尚未建立");
});
it.each(["course", "rental"])("釋放原課後仍阻擋延伸部分已占用的 %s", async kind => {
 const {rentalConflict} = await import("@/server/services/course-rental");
 const occupied = {...freed(), id: "new-occupant", requestKey: "another", startsAt: at("10:00"), endsAt: at("11:00"), releasedAt: null};
 const tx = recordsFixture(kind === "course" ? [freed(), occupied] : [freed()]);
 if (kind === "rental") tx.courseRental.findFirst.mockResolvedValue({id: "rental"} as never);
 await expect(rentalConflict(tx as unknown as Prisma.TransactionClient, store, "room", at("09:00"), at("11:00")))
  .rejects.toThrow("已有課程或租借");
});
it("較長租借可使用釋放時段及延伸空檔", async () => {
 const {rentalConflict} = await import("@/server/services/course-rental");
 await expect(rentalConflict(recordsFixture([freed()]) as unknown as Prisma.TransactionClient,
  store, "room", at("09:00"), at("11:00"))).resolves.toBeUndefined();
});
