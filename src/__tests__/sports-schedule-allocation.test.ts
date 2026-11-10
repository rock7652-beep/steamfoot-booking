import { beforeEach, it, expect, vi } from "vitest";
import type { Prisma } from "../../generated/course-client";
const m = vi.hoisted(() => ({
  reserve: vi.fn(),
  cards: vi.fn(),
  card: vi.fn(),
  execute: vi.fn(),
  sessions: vi.fn(),
  compensation:vi.fn(),
  snapshot:vi.fn(),
}));
vi.mock("@/lib/sports-staging", () => ({
  requireSportsStaging: vi.fn(),
  sportsStagingEnabled: () => true,
}));
vi.mock("@/lib/feature-gate", () => ({
  getStoreLimitsByStoreId: async () => ({ maxMonthlyBookings: null }),
}));
vi.mock("@/server/services/course-booking", () => ({
  reserveCourseInTransaction: m.reserve,
}));
import { assertSportsRentalFree, attachSportsSessionRules } from "@/server/services/sports-staging-schedule";

it('reports each conflicting schedule date and actual rental occupancy including buffers',async()=>{
 const range=(day:string)=>({startsAt:new Date(`${day}T01:00Z`),endsAt:new Date(`${day}T02:00Z`)});
 const findFirst=vi.fn(async({where}:{where:{storeId:string;roomId:string;cancelledAt:null;occupiedEndsAt:{gt:Date};occupiedStartsAt:{lt:Date}}})=>({occupiedStartsAt:where.occupiedEndsAt.gt,occupiedEndsAt:new Date(+where.occupiedStartsAt.lt+15*60000)}));
 const tx={courseRental:{findFirst}} as unknown as Prisma.TransactionClient;
 await expect(assertSportsRentalFree(tx,'store','room',[range('2026-11-23'),range('2026-11-30')]))
  .rejects.toThrow('2026-11-23 09:00 排課衝突：2026-11-23 09:00–2026-11-23 10:15 這個空間已有租借（含緩衝時間）；2026-11-30 09:00');
 expect(findFirst).toHaveBeenCalledTimes(2);
 expect(findFirst.mock.calls[0][0].where).toMatchObject({storeId:'store',roomId:'room',cancelledAt:null});
});
import { addTaiwanDuration, parseTaipeiDateTime } from "@/lib/date-utils";
const actor = { storeId: "store", userId: "owner", name: "Owner" };
const sessions = Array.from({ length: 8 }, (_, i) => ({
  id: `s${i}`,
  requestIndex: i,
  templateId: "template",
  startsAt: parseTaipeiDateTime(
    addTaiwanDuration("2099-01-01", i * 7, "DAY"),
    "20:00",
  )!,
  pointCost: 1,
  isTrial: false,
}));
const tx = {
  $executeRaw: m.execute,
  courseSession: { findMany: m.sessions },
  courseTemplate:{findFirst:async()=>({musicSubjectId:"subject"}),findMany:async()=>[{id:"template"}]},
  courseCompensation:{findUnique:m.compensation},
  courseCompensationSnapshot:{upsert:m.snapshot},
  coursePointPlan: {
    findFirst: async () => ({ id: "plan", templateIds: ["template"] }),
  },
  coursePointCard: { findMany: m.cards, findFirst: m.card },
} as unknown as Prisma.TransactionClient;
const rule = {
  frequency: "WEEKLY" as const,
  enrollment: "ASSIGNED" as const,
  planId: "plan",
  students: [{ customerId: "member", cardId: null as string | null }],
  trialPrice: 0,
};
beforeEach(() => {
  vi.clearAllMocks();
  m.sessions.mockResolvedValue(sessions);
  m.compensation.mockResolvedValue(null);
  m.cards.mockResolvedValue([
    {
      planId:"plan",templateIds:["template"],requestKey:"old",
      id: "used",expiresAt:new Date("2099-11-01"),
      unit: "SESSION",
      remaining: 10,
      bookings: [{ pointCost: 3 }],
    },
    { id: "available",expiresAt:new Date("2099-12-31"),planId:"plan",templateIds:["template"],requestKey:"old", unit: "SESSION", remaining: 10, bookings: [] },
  ]);
  m.card.mockResolvedValue({ id: "available", planId: "plan" });
  m.reserve.mockResolvedValue({ id: "booking" });
});
it("arranges fixed learners in an open class without charging or reserving a card",async()=>{
 m.sessions.mockResolvedValue([{...sessions[0],capacity:4}]);
 await attachSportsSessionRules(tx,actor,"request",{...rule,frequency:"SINGLE",enrollment:"OPEN"});
 expect(m.reserve).toHaveBeenCalledOnce();expect(m.reserve.mock.calls[0][2]).toMatchObject({customerId:"member",cardId:null,deferredPayment:true});
 expect(m.execute.mock.calls[0]).toContain("OPEN");
});
it("rejects an oversized mixed roster before writing rules or reservations",async()=>{
 m.sessions.mockResolvedValue([{...sessions[0],capacity:1}]);
 await expect(attachSportsSessionRules(tx,actor,"request",{...rule,frequency:"SINGLE",enrollment:"OPEN",students:[...rule.students,{customerId:"second",cardId:null}]})).rejects.toThrow("超過");
 expect(m.execute).not.toHaveBeenCalled();expect(m.reserve).not.toHaveBeenCalled();
});
it("arranges all lessons without reserving a particular plan or consuming credit",async()=>{
 await attachSportsSessionRules(tx,actor,"request",rule);
 expect(m.cards).not.toHaveBeenCalled();expect(m.reserve).toHaveBeenCalledTimes(8);
 for(const call of m.reserve.mock.calls)expect(call[2]).toMatchObject({cardId:null,deferredPayment:true,onSite:true,customerId:"member"});
});
it("ignores a stale plan selection when arranging an item",async()=>{
 await attachSportsSessionRules(tx,actor,"request",{...rule,students:[{customerId:"member",cardId:"original"}]});
 expect(m.cards).not.toHaveBeenCalled();expect(m.reserve.mock.calls[0][2]).toMatchObject({cardId:null,deferredPayment:true});
});
it("allows arrangement with no purchased plan; attendance is a separate command",async()=>{
 m.cards.mockResolvedValue([]);await attachSportsSessionRules(tx,actor,"request",rule);
 expect(m.reserve).toHaveBeenCalledTimes(8);expect(m.cards).not.toHaveBeenCalled();
});

it("captures each new hourly class independently without multiplying by pupils",async()=>{
 m.sessions.mockResolvedValue(sessions.map(s=>({...s,coachId:"coach",endsAt:new Date(s.startsAt.getTime()+90*60000)})));
 m.compensation.mockResolvedValue({rules:[{mode:"HOUR",value:600}],revision:2});
 await attachSportsSessionRules(tx,actor,"request",rule);
 expect(m.snapshot).toHaveBeenCalledTimes(8);
 expect(m.snapshot.mock.calls[0][0].create).toMatchObject({storeId:"store",rule:{mode:"HOUR",value:600,calculationVersion:3,durationMinutes:90},revision:2});
});

it.each(["OPEN","ASSIGNED"] as const)("%s 新課次優先保存個別教練費率，未改共用預設",async enrollment=>{
 const scheduled={...sessions[0],coachId:"coach",endsAt:new Date(sessions[0].startsAt.getTime()+90*60000)};
 m.sessions.mockResolvedValue([scheduled]);
 m.compensation.mockImplementation(async({where})=>({rules:[{mode:"HOUR",value:where.storeId_templateId_staffId.staffId?800:600}],revision:3}));
 await attachSportsSessionRules(tx,actor,"request",{...rule,enrollment,students:[]},[scheduled.id]);
 expect(m.snapshot).toHaveBeenCalledOnce();
 expect(m.snapshot.mock.calls[0][0].create).toMatchObject({staffId:"coach",rule:{mode:"HOUR",value:800,source:"SPORTS_COACH_FEE",calculationVersion:3,durationMinutes:90}});
 expect(m.reserve).not.toHaveBeenCalled();
});

it('allows the shared transaction to enroll new trial learners while retaining the empty assigned-class guard',async()=>{
 const trial={...sessions[0],isTrial:true,capacity:1};m.sessions.mockResolvedValue([trial]);
 const input={...rule,frequency:'SINGLE' as const,planId:null,students:[]};
 await expect(attachSportsSessionRules(tx,actor,'request',input)).rejects.toThrow('至少指定');
 await attachSportsSessionRules(tx,actor,'request',input,undefined,1);expect(m.reserve).not.toHaveBeenCalled();expect(m.execute).toHaveBeenCalledOnce();
 m.sessions.mockResolvedValue([{...trial,isTrial:false}]);await expect(attachSportsSessionRules(tx,actor,'request',input,undefined,1)).rejects.toThrow('體驗學員');
});
