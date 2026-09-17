vi.mock("@/lib/feature-gate", () => ({
  getStoreLimitsByStoreId: async () => ({ maxMonthlyBookings: null }),
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  transaction: vi.fn(),
  tx: {
    courseBooking: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    coursePointCard: { findFirst: vi.fn(), updateMany: vi.fn() },
    courseSession: { findFirst: vi.fn() },
    courseBookingRule: { findUnique: vi.fn() },
    coursePointEntry: { create: vi.fn(), findUnique: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/services/course-access", () => ({
  courseTransaction: m.transaction,
}));
import {
  reserveTrialCourse,
  reserveCourse,
  reserveCourseMembers,
  settleCourseBooking,
} from "@/server/services/course-booking";
import type { Prisma } from "../../generated/course-client";
const actor = {
  storeId: "store-a",
  userId: "user-a",
  name: "A",
  customerId: "a",
};
const input = {
  sessionId: "session",
  cardId: "card",
  customerId: "b",
  requestKey: "request",
};
const tx = m.tx as unknown as Prisma.TransactionClient;
function reserved(status = "RESERVED") {
  return {
    id: "booking",
    storeId: "store-a",
    cardId: "card",
    customerId: "b",
    status,
    pointCost: 3,
    session: { startsAt: new Date("2026-09-15T00:00:00Z") },
    card: { members: [{ customerId: "a" }, { customerId: "b" }] },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-15T10:00:00Z"));
  m.transaction.mockImplementation((_store, work) => work(m.tx));
  m.tx.courseSession.findFirst.mockResolvedValue({
    id: "session",
    startsAt: new Date("2026-09-16T10:00:00Z"),
    capacity: 2,
    pointCost: 3,
  });
  m.tx.coursePointCard.findFirst.mockResolvedValue({
    id: "card",
    remaining: 5,
    expiresAt: new Date("2026-10-01T00:00:00Z"),
    members: [{ customerId: "a" }, { customerId: "b" }],
  });
  m.tx.$queryRaw.mockResolvedValue([{ id: "b", name: "B" }]);
  m.tx.courseBookingRule.findUnique.mockResolvedValue(null);
  m.tx.courseBooking.findUnique.mockResolvedValue(null);
  m.tx.courseBooking.findFirst.mockResolvedValue(null);
  m.tx.courseBooking.count.mockResolvedValue(0);
  m.tx.courseBooking.aggregate.mockResolvedValue({ _sum: { pointCost: 0 } });
  m.tx.courseBooking.create.mockImplementation(({ data }) => ({
    id: "booking",
    ...data,
  }));
  m.tx.coursePointCard.updateMany.mockResolvedValue({ count: 1 });
});
describe("course shared card reservations", () => {
  it("A can reserve only B; keeps operator and learner separate and holds without spending", async () => {
    await reserveCourse(actor, input);
    expect(m.tx.courseBooking.create).toHaveBeenCalledOnce();
    expect(m.tx.courseBooking.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: "b",
        customerName: "B",
        operatorCustomerId: "a",
        operatorName: "A",
        pointCost: 3,
      }),
    });
    expect(m.tx.coursePointCard.updateMany).not.toHaveBeenCalled();
    expect(m.tx.coursePointEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: "RESERVE", points: 3 }),
    });
  });
  it.each(["operator", "learner"])(
    "rejects an unauthorized %s",
    async (which) => {
      await expect(
        reserveCourse(
          which === "operator" ? { ...actor, customerId: "outsider" } : actor,
          which === "learner" ? { ...input, customerId: "outsider" } : input,
        ),
      ).rejects.toThrow("授權成員");
      expect(m.tx.courseBooking.create).not.toHaveBeenCalled();
    },
  );
  it.each(["expired", "after-expiry", "full", "held", "duplicate", "foreign"])(
    "rejects %s without a write",
    async (reason) => {
      if (reason === "expired" || reason === "after-expiry")
        m.tx.coursePointCard.findFirst.mockResolvedValue({
          id: "card",
          remaining: 5,
          expiresAt: new Date(
            reason === "expired" ? "2026-09-01" : "2026-09-16T00:00:00Z",
          ),
          members: [{ customerId: "a" }, { customerId: "b" }],
        });
      if (reason === "full") m.tx.courseBooking.count.mockResolvedValue(2);
      if (reason === "held")
        m.tx.courseBooking.aggregate.mockResolvedValue({
          _sum: { pointCost: 3 },
        });
      if (reason === "duplicate")
        m.tx.courseBooking.findFirst.mockResolvedValue({ id: "existing" });
      if (reason === "foreign")
        m.tx.courseSession.findFirst.mockResolvedValue(null);
      await expect(reserveCourse(actor, input)).rejects.toThrow();
      expect(m.tx.courseBooking.create).not.toHaveBeenCalled();
      expect(m.tx.coursePointEntry.create).not.toHaveBeenCalled();
    },
  );
  it("returns a matching request retry without a second hold", async () => {
    m.tx.courseBooking.findUnique.mockResolvedValue({
      ...input,
      operatorUserId: "user-a",
      id: "existing",
    });
    expect(await reserveCourse(actor, input)).toMatchObject({ id: "existing" });
    expect(m.tx.courseBooking.create).not.toHaveBeenCalled();
  });
  it("rejects replay under another operator", async () => {
    m.tx.courseBooking.findUnique.mockResolvedValue({
      ...input,
      operatorUserId: "other",
    });
    await expect(reserveCourse(actor, input)).rejects.toThrow();
  });
});
describe("course point settlement", () => {
  it("attendance decrements once and creates one debit in the same transaction", async () => {
    m.tx.courseBooking.findFirst.mockResolvedValue(reserved());
    await settleCourseBooking(
      tx,
      { ...actor, customerId: undefined },
      "booking",
      "ATTENDED",
    );
    expect(m.tx.coursePointCard.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { remaining: { decrement: 3 } } }),
    );
    expect(m.tx.coursePointEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: "DEBIT", points: 3 }),
    });
    m.tx.courseBooking.findFirst.mockResolvedValue(reserved("ATTENDED"));
    await settleCourseBooking(
      tx,
      { ...actor, customerId: undefined },
      "booking",
      "ATTENDED",
    );
    expect(m.tx.coursePointCard.updateMany).toHaveBeenCalledOnce();
    expect(m.tx.coursePointEntry.create).toHaveBeenCalledOnce();
  });
  it("cancellation releases the hold without changing remaining balance", async () => {
    m.tx.courseBooking.findFirst.mockResolvedValue(reserved());
    await settleCourseBooking(
      tx,
      { ...actor, customerId: undefined },
      "booking",
      "CANCELLED",
    );
    expect(m.tx.coursePointCard.updateMany).not.toHaveBeenCalled();
    expect(m.tx.coursePointEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: "RELEASE" }),
    });
  });
  it("denies customer attendance and post-cutoff cancellation", async () => {
    m.tx.courseBooking.findFirst.mockResolvedValue(reserved());
    await expect(
      settleCourseBooking(tx, actor, "booking", "ATTENDED"),
    ).rejects.toThrow();
    await expect(
      settleCourseBooking(tx, actor, "booking", "CANCELLED"),
    ).rejects.toThrow();
    expect(m.tx.courseBooking.update).not.toHaveBeenCalled();
  });
  it("cannot update booking state when the debit fails", async () => {
    m.tx.courseBooking.findFirst.mockResolvedValue(reserved());
    m.tx.coursePointCard.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      settleCourseBooking(
        tx,
        { ...actor, customerId: undefined },
        "booking",
        "ATTENDED",
      ),
    ).rejects.toThrow();
    expect(m.tx.courseBooking.update).not.toHaveBeenCalled();
    expect(m.tx.coursePointEntry.create).not.toHaveBeenCalled();
  });
});

describe("course attendance stages", () => {
  const manager = { storeId: actor.storeId, userId: "manager", name: "店長" };
  it("check-in preserves reservation and does not debit or release points", async () => {
    m.tx.courseBooking.findFirst.mockResolvedValue(reserved());
    await settleCourseBooking(tx, manager, "booking", "CHECKED_IN");
    expect(m.tx.courseBooking.update).toHaveBeenCalledWith({
      where: { id: "booking" },
      data: { checkedInAt: expect.any(Date) },
    });
    expect(m.tx.coursePointCard.updateMany).not.toHaveBeenCalled();
    expect(m.tx.coursePointEntry.create).not.toHaveBeenCalled();
  });
  it("repeating check-in makes no additional change", async () => {
    m.tx.courseBooking.findFirst.mockResolvedValue({
      ...reserved(),
      checkedInAt: new Date(),
    });
    await settleCourseBooking(tx, manager, "booking", "CHECKED_IN");
    expect(m.tx.courseBooking.update).not.toHaveBeenCalled();
  });
  it("no-show releases the reservation without charging", async () => {
    m.tx.courseBooking.findFirst.mockResolvedValue(reserved());
    await settleCourseBooking(tx, manager, "booking", "NO_SHOW");
    expect(m.tx.coursePointCard.updateMany).not.toHaveBeenCalled();
    expect(m.tx.coursePointEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: "RELEASE", points: 3 }),
    });
    expect(m.tx.courseBooking.update).toHaveBeenCalledWith({
      where: { id: "booking" },
      data: { status: "NO_SHOW" },
    });
  });
  it("members cannot check in or mark no-show", async () => {
    m.tx.courseBooking.findFirst.mockResolvedValue(reserved());
    for (const status of ["CHECKED_IN", "NO_SHOW"] as const)
      await expect(
        settleCourseBooking(tx, actor, "booking", status),
      ).rejects.toThrow("僅限有權限");
    expect(m.tx.courseBooking.update).not.toHaveBeenCalled();
  });
  it("no-show cannot be recorded before class starts", async () => {
    m.tx.courseBooking.findFirst.mockResolvedValue({
      ...reserved(),
      session: { startsAt: new Date("2026-09-16T00:00:00Z") },
    });
    await expect(
      settleCourseBooking(tx, manager, "booking", "NO_SHOW"),
    ).rejects.toThrow("尚未開始");
    expect(m.tx.coursePointEntry.create).not.toHaveBeenCalled();
  });
});

describe("atomic multi-learner reservations", () => {
  const batch = {
    sessionId: "session",
    cardId: "card",
    customerIds: ["a", "b"],
    requestKey: "batch",
  };
  it("creates all learners inside one store transaction", async () => {
    await reserveCourseMembers(actor, batch);
    expect(m.transaction).toHaveBeenCalledOnce();
    expect(
      m.tx.courseBooking.create.mock.calls.map(([x]) => x.data.customerId),
    ).toEqual(["a", "b"]);
    expect(m.tx.coursePointEntry.create).toHaveBeenCalledTimes(2);
  });
  it.each(["points", "capacity"])(
    "propagates the second learner failure to roll back the entire %s transaction",
    async (reason) => {
      if (reason === "points")
        m.tx.courseBooking.aggregate
          .mockResolvedValueOnce({ _sum: { pointCost: 0 } })
          .mockResolvedValueOnce({ _sum: { pointCost: 3 } });
      else
        m.tx.courseBooking.count
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(2);
      await expect(reserveCourseMembers(actor, batch)).rejects.toThrow(
        reason === "points" ? "點數不足" : "滿班",
      );
      expect(m.transaction).toHaveBeenCalledOnce();
      expect(m.tx.courseBooking.create).toHaveBeenCalledOnce();
    },
  );
  it("reuses stable per-learner keys regardless of checkbox order", async () => {
    await reserveCourseMembers(actor, batch);
    const records = m.tx.courseBooking.create.mock.calls.map(([{ data }]) => ({
      id: data.customerId,
      ...data,
    }));
    m.tx.courseBooking.findUnique.mockImplementation(({ where }) =>
      records.find((b) => b.requestKey === where.storeId_requestKey.requestKey),
    );
    m.tx.courseBooking.create.mockClear();
    await reserveCourseMembers(actor, { ...batch, customerIds: ["b", "a"] });
    expect(m.tx.courseBooking.create).not.toHaveBeenCalled();
  });
  it("rejects duplicate checkbox identities", async () => {
    await expect(
      reserveCourseMembers(actor, { ...batch, customerIds: ["b", "b"] }),
    ).rejects.toThrow("不重複");
    expect(m.transaction).not.toHaveBeenCalled();
  });
});

it("member booking cutoff is inclusive and blocks the first instant beyond without holding points", async () => {
  m.tx.$queryRaw.mockImplementation(async (sql: TemplateStringsArray) => sql.join("").includes('"ShopConfig"') ? [{bookableUntilDate:new Date("2026-09-16T00:00:00Z")}] : [{id:"b",name:"B"}]);
  m.tx.courseSession.findFirst.mockResolvedValue({id:"session",startsAt:new Date("2026-09-16T23:59:59.999+08:00"),capacity:2,pointCost:3});
  await expect(reserveCourse(actor,input)).resolves.toBeDefined();
  m.tx.courseSession.findFirst.mockResolvedValue({id:"session",startsAt:new Date("2026-09-17T00:00:00+08:00"),capacity:2,pointCost:3});
  m.tx.courseBooking.create.mockClear(); m.tx.coursePointEntry.create.mockClear();
  await expect(reserveCourse(actor,{...input,requestKey:"next"})).rejects.toThrow("尚未開放");
  expect(m.tx.courseBooking.create).not.toHaveBeenCalled();expect(m.tx.coursePointEntry.create).not.toHaveBeenCalled();
});
it("manager proxy booking retains the mature exemption from member opening window", async () => {
  m.tx.$queryRaw.mockImplementation(async (sql: TemplateStringsArray) => sql.join("").includes('"ShopConfig"') ? [{bookableUntilDate:new Date("2026-09-15T00:00:00Z")}] : [{id:"b",name:"B"}]);
  await expect(reserveCourse({...actor,customerId:undefined},input)).resolves.toBeDefined();
});

describe("course trial shares booking safety without using a card",()=>{
 it("reserves a real seat and writes no point entry",async()=>{await reserveTrialCourse({storeId:"store-a",userId:"manager",name:"店長"},{sessionId:"session",customerId:"b",requestKey:"trial",trialPrice:499});expect(m.tx.courseBooking.create).toHaveBeenCalledWith({data:expect.objectContaining({cardId:null,bookingKind:"TRIAL",pointCost:0,trialPrice:499,customerId:"b"})});expect(m.tx.coursePointCard.findFirst).not.toHaveBeenCalled();expect(m.tx.coursePointEntry.create).not.toHaveBeenCalled();});
 it("blocks duplicate learner and full class even without quota",async()=>{m.tx.courseBooking.findFirst.mockResolvedValue({id:"existing"});await expect(reserveTrialCourse({storeId:"store-a",userId:"manager",name:"店長"},{sessionId:"session",customerId:"b",requestKey:"trial",trialPrice:499})).rejects.toThrow("已預約");m.tx.courseBooking.findFirst.mockResolvedValue(null);m.tx.courseBooking.count.mockResolvedValue(2);await expect(reserveTrialCourse({storeId:"store-a",userId:"manager",name:"店長"},{sessionId:"session",customerId:"b",requestKey:"trial",trialPrice:499})).rejects.toThrow("滿班");});
 it("does not let a member call the internal manager trial reservation",async()=>{await expect(reserveTrialCourse(actor,{sessionId:"session",customerId:"b",requestKey:"trial",trialPrice:499})).rejects.toThrow("僅由");});
});
