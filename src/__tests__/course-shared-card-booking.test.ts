import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "../../generated/course-client";

const m = vi.hoisted(() => ({
  state: vi.fn(), transaction: vi.fn(), feature: vi.fn(), limits: vi.fn(), window: vi.fn(), audit: vi.fn(),
  db: {} as Record<string, unknown>,
}));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: new Proxy({}, { get: (_target, key) => m.db[key as string] }) }));
vi.mock("@/lib/feature-gate", () => ({ getStoreLimitsByStoreId: m.limits, hasStoreFeature: m.feature }));
vi.mock("@/lib/shop-config", () => ({ resolveCustomerBookingWindow: m.window }));
vi.mock("@/server/services/course-access", () => ({ courseTransaction: m.transaction }));
vi.mock("@/server/services/course-shared-card", () => ({ getCourseSharedCardStateInTransaction: m.state }));
vi.mock("@/server/services/operation-audit-outbox", () => ({ enqueueOperationAudit: m.audit }));

import { correctCourseAttendance, refundTeacherAbsentSession, reserveCourseInTransaction, settleCourseBooking } from "@/server/services/course-booking";
import { changeCompanionUsage } from "@/server/services/course-companions";
import { cancelMemberCourseWaitlist, joinCourseWaitlist, promoteCourseWaitlistForSession } from "@/server/services/course-waitlist";

const actor = { storeId: "sports", userId: "member", name: "本人", customerId: "owner" };
const manager = { storeId: "sports", userId: "manager", name: "店長" };
const session = {
  id: "session", templateId: "template", teacherAttendance: "SCHEDULED", startsAt: new Date("2099-01-01T08:00:00Z"),
  endsAt: new Date("2099-01-01T09:00:00Z"), capacity: 5, pointCost: 2, cancelledAt: null, releasedAt: null,
  template: { isActive: true, visibility: "PUBLIC", waitlistEnabled: true, waitlistLimit: 5 },
};
const card = {
  id: "card", unit: "POINT", plan: { allowShared: true }, termSessionIds: [], templateIds: [], remaining: 20,
  expiresAt: new Date("2099-12-31"), members: [{ customerId: "owner" }, { customerId: "existing" }],
};
const companion = { sessionId: "session", cardId: "card", customerId: null, companionIndex: 1, customerName: "同行者 1", reserverCustomerId: "owner", reserverCardId: "card", requestKey: "request" };
const booking = { id: "booking", ...companion, session, card, operatorUserId: "member", status: "RESERVED", pointCost: 2, trialPrice: null, trialPayments: [], updatedAt: new Date("2026-10-07T00:00:00Z") };
const db = {
  courseBooking: { findUnique: vi.fn(), findFirst: vi.fn(), findFirstOrThrow: vi.fn(), findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn(), create: vi.fn(), update: vi.fn() },
  courseSession: { findFirst: vi.fn(), update: vi.fn() },
  coursePointCard: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  courseBookingRule: { findUnique: vi.fn() },
  coursePointEntry: { create: vi.fn(), findUnique: vi.fn() },
  courseWaitlistSetting: { findUnique: vi.fn() },
  courseWaitlistEntry: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  $queryRaw: vi.fn(), $executeRaw: vi.fn(), $executeRawUnsafe: vi.fn(),
};
const tx = db as unknown as Prisma.TransactionClient;
let waitingEntries: ReturnType<typeof entry>[] = [];

beforeEach(() => {
  vi.resetAllMocks();
  waitingEntries = [];
  m.state.mockResolvedValue("ENABLED");
  m.feature.mockResolvedValue(true);
  m.limits.mockResolvedValue({ maxMonthlyBookings: null });
  m.window.mockReturnValue({ closesAt: new Date("2099-12-31") });
  m.transaction.mockImplementation((_storeId, work) => work(tx));
  m.db.$transaction = (work: (tx: Prisma.TransactionClient) => unknown) => work(tx);
  m.db.courseWaitlistSetting = db.courseWaitlistSetting;
  db.courseBooking.findUnique.mockResolvedValue(null);
  db.courseBooking.findFirst.mockResolvedValue(null);
  db.courseBooking.findMany.mockResolvedValue([]);
  db.courseBooking.count.mockResolvedValue(0);
  db.courseBooking.aggregate.mockResolvedValue({ _sum: { pointCost: 0 } });
  db.courseBooking.create.mockImplementation(async ({ data }) => ({ id: `new-${data.customerId ?? "guest"}`, ...data }));
  db.courseBooking.update.mockImplementation(async ({ data }) => ({ ...booking, ...data }));
  db.courseSession.findFirst.mockResolvedValue(session);
  db.coursePointCard.findFirst.mockResolvedValue(card);
  db.coursePointCard.updateMany.mockResolvedValue({ count: 1 });
  db.courseWaitlistSetting.findUnique.mockResolvedValue({ enabled: true, defaultLimit: 5, autoPromoteStopMinutes: 240 });
  db.courseWaitlistEntry.findMany.mockImplementation(async () => waitingEntries);
  db.courseWaitlistEntry.findFirst.mockImplementation(async ({ where }) =>
    waitingEntries.find(row => Object.entries(where).every(([key, value]) => Reflect.get(row, key) === value)) ?? null);
  db.courseWaitlistEntry.count.mockResolvedValue(0);
  db.courseWaitlistEntry.create.mockImplementation(async ({ data }) => data);
  db.$queryRaw.mockImplementation(async (sql: TemplateStringsArray) => {
    const text = sql.join("");
    if (text.includes('"Customer"')) return [{ id: "owner", name: "本人" }];
    if (text.includes('FROM "Store"')) return [{ id: "sports" }];
    if (text.includes('"SpecialBusinessDay"')) return [{ closed: false }];
    return [];
  });
});

describe("new anonymous companions", () => {
  it.each(["LOCKED", "HIDDEN"])("rejects direct and on-site reservations while %s", async state => {
    m.state.mockResolvedValue(state);
    await expect(reserveCourseInTransaction(tx, actor, companion, null)).rejects.toThrow("不能新增同行預約");
    await expect(reserveCourseInTransaction(tx, manager, { ...companion, onSite: true }, null)).rejects.toThrow("不能新增同行預約");
    expect(db.courseBooking.create).not.toHaveBeenCalled();
    expect(db.coursePointEntry.create).not.toHaveBeenCalled();
  });

  it("requires both enabled state and a sharing-enabled plan", async () => {
    await expect(reserveCourseInTransaction(tx, actor, companion, null)).resolves.toMatchObject({ companionIndex: 1, pointCost: 2 });
    expect(m.state).toHaveBeenCalledWith(tx, "sports");
    db.coursePointCard.findFirst.mockResolvedValue({ ...card, plan: { allowShared: false } });
    await expect(reserveCourseInTransaction(tx, actor, companion, null)).rejects.toThrow("此方案未開放");
  });

  it("allows existing named members to reserve when new sharing is unavailable", async () => {
    m.state.mockResolvedValue("HIDDEN");
    db.coursePointCard.findFirst.mockResolvedValue({ ...card, plan: { allowShared: false } });
    await expect(reserveCourseInTransaction(tx, actor, { sessionId: "session", cardId: "card", customerId: "existing", requestKey: "named" }, null)).resolves.toMatchObject({ customerId: "existing" });
    expect(m.state).not.toHaveBeenCalled();
  });

  it("does not turn an idempotent replay into a new entitlement requirement", async () => {
    m.state.mockResolvedValue("LOCKED");
    db.courseBooking.findUnique.mockResolvedValue(booking);
    await expect(reserveCourseInTransaction(tx, actor, companion, null)).resolves.toBe(booking);
    expect(m.state).not.toHaveBeenCalled();
    expect(db.courseBooking.create).not.toHaveBeenCalled();
  });
});

describe("historical companion rights", () => {
  it.each(["LOCKED", "HIDDEN"])("preserves cancellation, attendance, correction and refunds while %s", async state => {
    m.state.mockResolvedValue(state);
    db.courseBooking.findFirst.mockResolvedValue(booking);
    await expect(settleCourseBooking(tx, actor, booking.id, "CANCELLED")).resolves.toMatchObject({ status: "CANCELLED" });
    await expect(settleCourseBooking(tx, manager, booking.id, "ATTENDED")).resolves.toMatchObject({ status: "ATTENDED" });
    db.courseBooking.findFirst.mockResolvedValue({ ...booking, status: "ATTENDED" });
    await expect(correctCourseAttendance(tx, manager, booking.id, "RESERVED", "ATTENDED")).resolves.toMatchObject({ status: "RESERVED" });
    expect(db.coursePointCard.update).toHaveBeenCalledWith({ where: { id: "card" }, data: { remaining: { increment: 2 } } });
    db.courseBooking.findMany.mockResolvedValue([{ ...booking, status: "ATTENDED" }]);
    await expect(refundTeacherAbsentSession(tx, manager, "session")).resolves.toBe(1);
    expect(m.state).not.toHaveBeenCalled();
  });

  it("permits a correction back to the original reserver even if the plan stops new sharing", async () => {
    m.state.mockResolvedValue("HIDDEN");
    db.courseBooking.findFirst.mockResolvedValue({ ...booking, cardId: null, card: null, bookingKind: "TRIAL", pointCost: 0 });
    db.coursePointCard.findFirst.mockResolvedValue({ ...card, plan: { allowShared: false } });
    await expect(changeCompanionUsage(tx, manager, { bookingId: booking.id, mode: "RESERVER", expectedUpdatedAt: booking.updatedAt.toISOString(), requestKey: "correct" })).resolves.toMatchObject({ cardId: "card", pointCost: 2 });
    expect(db.coursePointCard.findFirst).toHaveBeenCalledWith({ where: { id: "card", storeId: "sports" }, include: { members: true } });
    expect(m.state).not.toHaveBeenCalled();
  });

  it("still requires the original reserver's membership for corrections", async () => {
    db.courseBooking.findFirst.mockResolvedValue(booking);
    db.coursePointCard.findFirst.mockResolvedValue({ ...card, members: [] });
    await expect(changeCompanionUsage(tx, manager, { bookingId: booking.id, mode: "RESERVER", expectedUpdatedAt: booking.updatedAt.toISOString(), requestKey: "correct" })).rejects.toThrow("無權使用此方案");
  });
});

function entry(id: string, customerId: string | null, groupKey: string, companionIndex: number | null = null) {
  return { id, customerId, groupKey, companionIndex, status: "WAITING", storeId: "sports", sessionId: "session", cardId: "card", customerName: customerId ? "本人" : "同行者 1", reserverCustomerId: "owner", reserverCardId: "card", reserverName: "本人", operatorCustomerId: "owner", operatorUserId: "member", operatorName: "本人", createdAt: new Date("2026-10-07T00:00:00Z") };
}

describe("shared-card waitlist", () => {
  it.each(["LOCKED", "HIDDEN"])("rejects new anonymous joins while %s", async state => {
    m.state.mockResolvedValue(state);
    await expect(joinCourseWaitlist(actor, { sessionId: "session", cardId: "card", customerIds: ["owner"], companionNames: ["朋友"], requestKey: "join" })).rejects.toThrow("不能新增同行候補");
    expect(db.courseWaitlistEntry.create).not.toHaveBeenCalled();
  });

  it("allows named-member waitlist joins despite a hidden new-sharing feature", async () => {
    m.state.mockResolvedValue("HIDDEN");
    db.courseBooking.count.mockResolvedValue(5);
    await expect(joinCourseWaitlist(actor, { sessionId: "session", cardId: "card", customerIds: ["owner"], requestKey: "join" })).resolves.toMatchObject({ rows: [expect.objectContaining({ customerId: "owner" })] });
    expect(m.state).not.toHaveBeenCalled();
  });

  it.each(["LOCKED", "HIDDEN"])("preserves already-authorized companion and named-member queue rights while %s", async state => {
    m.state.mockResolvedValue(state);
    db.coursePointCard.findFirst.mockResolvedValue({ ...card, plan: { allowShared: false } });
    waitingEntries = [entry("owner-wait", "owner", "companions"), entry("guest-wait", null, "companions", 1), entry("named-wait", "existing", "named")];
    const promoted = await promoteCourseWaitlistForSession(tx, "sports", "session");
    expect(promoted.map(item => item.entryId).sort()).toEqual(["owner-wait", "guest-wait", "named-wait"].sort());
    expect(db.courseWaitlistEntry.updateMany).not.toHaveBeenCalled();
    expect(db.courseWaitlistEntry.update).toHaveBeenCalledTimes(3);
    expect(m.state).not.toHaveBeenCalled();
  });

  it("promotes the same persisted companion group when sharing remains enabled", async () => {
    waitingEntries = [entry("owner-wait", "owner", "companions"), entry("guest-wait", null, "companions", 1)];
    expect((await promoteCourseWaitlistForSession(tx, "sports", "session")).map(item => item.entryId)).toEqual(["owner-wait", "guest-wait"]);
    expect(db.courseWaitlistEntry.updateMany).not.toHaveBeenCalled();
    expect(db.$executeRawUnsafe).toHaveBeenCalledWith("RELEASE SAVEPOINT course_waitlist_group");
  });
});


describe("persisted waitlist authorization cannot expand sharing", () => {
  const queued = { ...companion, reserverName: "本人", groupKey: "companions", requestKey: "waitlist-promote:guest-wait" };
  const options = { existingWaitlistEntryId: "guest-wait" };
  beforeEach(() => {
    m.state.mockResolvedValue("HIDDEN");
    waitingEntries = [entry("guest-wait", null, "companions", 1)];
  });

  it.each([
    { cardId: "other" }, { sessionId: "other" }, { customerName: "replacement" },
    { groupKey: "expanded" }, { companionIndex: 2 }, { reserverCustomerId: "existing" },
    { reserverCardId: "other" }, { reserverName: "replacement" }, { requestKey: "new-reservation" },
  ])("rejects a changed queued reservation: %j", async change => {
    await expect(reserveCourseInTransaction(tx, actor, { ...queued, ...change }, null, options)).rejects.toThrow("原同行候補紀錄已變更");
    expect(db.courseBooking.create).not.toHaveBeenCalled();
  });

  it.each([{ userId: "other" }, { customerId: "existing" }, { name: "replacement" }, { storeId: "other" }])("rejects a changed operator: %j", async change => {
    await expect(reserveCourseInTransaction(tx, { ...actor, ...change }, queued, null, options)).rejects.toThrow("原同行候補紀錄已變更");
    expect(db.courseBooking.create).not.toHaveBeenCalled();
  });

  it.each(["PROMOTED", "CANCELLED", "SKIPPED"])("rejects an entry that is already %s", async status => {
    waitingEntries[0].status = status;
    await expect(reserveCourseInTransaction(tx, actor, queued, null, options)).rejects.toThrow("原同行候補紀錄已變更");
  });

  it("rejects absent entries and callers without persisted promotion context", async () => {
    await expect(reserveCourseInTransaction(tx, actor, queued, null)).rejects.toThrow("不能新增同行預約");
    waitingEntries = [];
    await expect(reserveCourseInTransaction(tx, actor, queued, null, options)).rejects.toThrow("原同行候補紀錄已變更");
  });

  it("retains capacity, balance, expiry and membership checks for authorized old entries", async () => {
    db.courseBooking.count.mockResolvedValue(session.capacity);
    await expect(reserveCourseInTransaction(tx, actor, queued, null, options)).rejects.toThrow("滿班");
    db.courseBooking.count.mockResolvedValue(0);
    db.coursePointCard.findFirst.mockResolvedValue({ ...card, remaining: 0 });
    await expect(reserveCourseInTransaction(tx, actor, queued, null, options)).rejects.toThrow("可用點數不足");
    db.coursePointCard.findFirst.mockResolvedValue({ ...card, expiresAt: new Date("2000-01-01") });
    await expect(reserveCourseInTransaction(tx, actor, queued, null, options)).rejects.toThrow("方案已到期");
    db.coursePointCard.findFirst.mockResolvedValue({ ...card, members: [] });
    await expect(reserveCourseInTransaction(tx, actor, queued, null, options)).rejects.toThrow("授權成員");
    expect(db.courseBooking.create).not.toHaveBeenCalled();
  });

  it("replays an already-promoted reservation after sharing is disabled without creating another seat", async () => {
    const promoted = { ...booking, ...queued };
    db.courseBooking.findUnique.mockResolvedValue(promoted);
    waitingEntries[0].status = "PROMOTED";
    await expect(reserveCourseInTransaction(tx, actor, queued, null, options)).resolves.toBe(promoted);
    expect(db.courseWaitlistEntry.findFirst).not.toHaveBeenCalled();
    expect(db.courseBooking.create).not.toHaveBeenCalled();
    expect(m.state).not.toHaveBeenCalled();
  });
});


describe("student self-booking control", () => {
  const named = {sessionId:"session",cardId:"card",customerId:"owner",requestKey:"self-policy"};
  it.each([undefined, null, {}, {selfBookingEnabled:true}])("keeps existing defaults enabled: %s", async rule => {
    db.courseBookingRule.findUnique.mockResolvedValue(rule);
    await expect(reserveCourseInTransaction(tx, actor, named, null)).resolves.toMatchObject({customerId:"owner"});
  });
  it.each(["owner", "existing", null])("blocks own, named shared member and anonymous companion new booking: %s", async customerId => {
    db.courseBookingRule.findUnique.mockResolvedValue({selfBookingEnabled:false});
    const input = customerId ? {...named,customerId} : companion;
    await expect(reserveCourseInTransaction(tx, actor, input, null)).rejects.toThrow("如需預約或調整時間，請聯繫店家");
    expect(db.courseBookingRule.findUnique).toHaveBeenCalledWith({where:{storeId:"sports"}});
    expect(db.courseBooking.create).not.toHaveBeenCalled();expect(db.coursePointEntry.create).not.toHaveBeenCalled();
  });
  it("allows staff reservations and existing member cancellation with self-booking off", async()=>{
    db.courseBookingRule.findUnique.mockResolvedValue({selfBookingEnabled:false});
    await expect(reserveCourseInTransaction(tx, manager, named, null)).resolves.toMatchObject({customerId:"owner"});
    db.courseBooking.findFirst.mockResolvedValue(booking);
    await expect(settleCourseBooking(tx,actor,booking.id,"CANCELLED")).resolves.toMatchObject({status:"CANCELLED"});
  });
  it("keeps member cancellation cutoff enforced while self-booking is off", async()=>{
    db.courseBookingRule.findUnique.mockResolvedValue({selfBookingEnabled:false,cancellationLeadMinutes:60});
    db.courseBooking.findFirst.mockResolvedValue({...booking,session:{...session,startsAt:new Date(Date.now()+30*60000)}});
    await expect(settleCourseBooking(tx,actor,booking.id,"CANCELLED")).rejects.toThrow("取消截止");
    expect(db.courseBooking.update).not.toHaveBeenCalled();
  });
  it("does not reinterpret an existing booking receipt as a new reservation", async()=>{
    db.courseBookingRule.findUnique.mockResolvedValue({selfBookingEnabled:false});
    db.courseBooking.findUnique.mockResolvedValue(booking);
    await expect(reserveCourseInTransaction(tx,actor,companion,null)).resolves.toBe(booking);
    expect(db.courseBooking.create).not.toHaveBeenCalled();expect(db.courseBookingRule.findUnique).not.toHaveBeenCalled();
  });
  it("blocks new student waitlist joins but allows staff joins", async()=>{
    db.courseBookingRule.findUnique.mockResolvedValue({selfBookingEnabled:false});
    db.courseBooking.count.mockResolvedValue(5);
    const input={sessionId:"session",cardId:"card",customerIds:["owner"],requestKey:"join-policy"};
    await expect(joinCourseWaitlist(actor,input)).rejects.toThrow("如需預約或調整時間，請聯繫店家");
    expect(db.courseWaitlistEntry.create).not.toHaveBeenCalled();
    await expect(joinCourseWaitlist(manager,input)).resolves.toMatchObject({rows:[expect.objectContaining({customerId:"owner"})]});
  });
  it.each([{}, {ignoreCutoff:true}])("pauses automatic promotion before queue processing without dropping entries: %s", async options=>{
    db.courseBookingRule.findUnique.mockResolvedValue({selfBookingEnabled:false});
    waitingEntries=[entry("owner-wait","owner","group"),entry("guest-wait",null,"group",1)];
    const before=structuredClone(waitingEntries);
    await expect(promoteCourseWaitlistForSession(tx,"sports","session",options)).resolves.toEqual([]);
    expect(waitingEntries).toEqual(before);
    expect(db.courseWaitlistEntry.findMany).not.toHaveBeenCalled();expect(db.courseWaitlistEntry.update).not.toHaveBeenCalled();expect(db.courseWaitlistEntry.updateMany).not.toHaveBeenCalled();
    expect(db.courseBooking.create).not.toHaveBeenCalled();expect(db.coursePointEntry.create).not.toHaveBeenCalled();expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
  });
  it("resumes FIFO after re-enabling without replacing request keys or entries", async()=>{
    waitingEntries=[entry("owner-wait","owner","a"),{...entry("named-wait","existing","b"),createdAt:new Date("2026-10-07T00:01:00Z")}];
    db.courseBookingRule.findUnique.mockResolvedValue({selfBookingEnabled:false});
    await promoteCourseWaitlistForSession(tx,"sports","session");
    db.courseBookingRule.findUnique.mockResolvedValue({selfBookingEnabled:true});
    const promoted=await promoteCourseWaitlistForSession(tx,"sports","session");
    expect(promoted.map(row=>row.entryId)).toEqual(["owner-wait","named-wait"]);
    expect(db.courseBooking.create.mock.calls.map(([arg])=>arg.data.requestKey)).toEqual(["waitlist-promote:owner-wait","waitlist-promote:named-wait"]);
    expect(db.courseWaitlistEntry.updateMany).not.toHaveBeenCalled();
  });
  it("allows permission-gated manual promotion with an exact persisted member and companion group", async()=>{
    db.courseBookingRule.findUnique.mockResolvedValue({selfBookingEnabled:false});
    waitingEntries=[entry("owner-wait","owner","a"),entry("guest-wait",null,"a",1)];
    const promoted=await promoteCourseWaitlistForSession(tx,"sports","session",{ignoreCutoff:true,manual:true});
    expect(promoted.map(row=>row.entryId)).toEqual(["owner-wait","guest-wait"]);
    expect(db.courseWaitlistEntry.updateMany).not.toHaveBeenCalled();
  });
  it("does not accept a manual override without a matching persisted queue entry", async()=>{
    db.courseBookingRule.findUnique.mockResolvedValue({selfBookingEnabled:false});
    await expect(reserveCourseInTransaction(tx,actor,named,null,{manualWaitlistPromotion:true})).rejects.toThrow("人工遞補必須");
    await expect(reserveCourseInTransaction(tx,actor,{...named,requestKey:"waitlist-promote:missing"},null,{manualWaitlistPromotion:true,existingWaitlistEntryId:"missing"})).rejects.toThrow("候補紀錄已變更");
    expect(db.courseBooking.create).not.toHaveBeenCalled();
  });
});

it("keeps cancelling an existing waitlist group available while self-booking is off", async()=>{
  db.courseBookingRule.findUnique.mockResolvedValue({selfBookingEnabled:false});
  waitingEntries=[entry("owner-wait","owner","a"),entry("guest-wait",null,"a",1)];
  db.courseWaitlistEntry.updateMany.mockResolvedValue({count:2});
  expect(await cancelMemberCourseWaitlist(actor,{sessionId:"session"})).toEqual({count:2});
  expect(db.courseWaitlistEntry.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:{storeId:"sports",sessionId:"session",groupKey:"a",status:"WAITING"},data:expect.objectContaining({status:"CANCELLED"})}));
  expect(db.courseBookingRule.findUnique).not.toHaveBeenCalled();
});
