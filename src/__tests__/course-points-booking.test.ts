vi.mock("@/lib/feature-gate", () => ({ getStoreLimitsByStoreId: async () => ({ maxMonthlyBookings: null }) }));
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
    coursePointEntry: { create: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/services/course-access", () => ({
  courseTransaction: m.transaction,
}));
import {
  reserveCourse,
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
