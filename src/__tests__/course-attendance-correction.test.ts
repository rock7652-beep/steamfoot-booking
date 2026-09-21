import { beforeEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/feature-gate", () => ({ getStoreLimitsByStoreId: vi.fn() }));
vi.mock("@/server/services/course-access", () => ({
  courseTransaction: vi.fn(),
}));
import { correctCourseAttendance } from "@/server/services/course-booking";
import type { Prisma } from "../../generated/course-client";
const m = {
  courseBooking: { findFirst: vi.fn(), aggregate: vi.fn(), update: vi.fn() },
  coursePointCard: { update: vi.fn() },
  coursePointEntry: { create: vi.fn() },
};
const tx = m as unknown as Prisma.TransactionClient;
const actor = { storeId: "a", userId: "coach", name: "Coach" };
const booking = (status: string, remaining = 7) => ({
  id: "b",
  status,
  cardId: "c",
  pointCost: 3,
  session: { startsAt: new Date("2020-01-01"), cancelledAt: null },
  card: { remaining },
});
beforeEach(() => {
  vi.clearAllMocks();
  m.courseBooking.aggregate.mockResolvedValue({ _sum: { pointCost: 0 } });
  m.courseBooking.update.mockImplementation(async (x) => x.data);
});
describe("course attendance correction", () => {
  it("cannot restore or spend quota after a refund", async () => {
    m.courseBooking.findFirst.mockResolvedValue({ ...booking("NO_SHOW"), card: { remaining: 0, closedAt: new Date() } });
    await expect(correctCourseAttendance(tx, actor, "b", "RESERVED", "NO_SHOW")).rejects.toThrow("已退款或結清");
    expect(m.coursePointCard.update).not.toHaveBeenCalled();
    expect(m.coursePointEntry.create).not.toHaveBeenCalled();
  });
  it("refunds attendance before reserving again", async () => {
    m.courseBooking.findFirst.mockResolvedValue(booking("ATTENDED"));
    await correctCourseAttendance(tx, actor, "b", "RESERVED", "ATTENDED");
    expect(m.coursePointCard.update).toHaveBeenCalledWith({
      where: { id: "c" },
      data: { remaining: { increment: 3 } },
    });
    expect(m.coursePointEntry.create.mock.calls[0][0].data.kind).toMatch(
      /^CORRECT:ATTENDED:RESERVED:/,
    );
  });
  it("charges previously absent learner once", async () => {
    m.courseBooking.findFirst.mockResolvedValue(booking("NO_SHOW"));
    await correctCourseAttendance(tx, actor, "b", "ATTENDED", "NO_SHOW");
    expect(
      m.coursePointCard.update.mock.calls[0][0].data.remaining.increment,
    ).toBe(-3);
    m.courseBooking.findFirst.mockResolvedValue(booking("ATTENDED"));
    await correctCourseAttendance(tx, actor, "b", "ATTENDED", "NO_SHOW");
    expect(m.coursePointCard.update).toHaveBeenCalledTimes(1);
  });
  it("rejects spending held by other bookings", async () => {
    m.courseBooking.findFirst.mockResolvedValue(booking("NO_SHOW", 3));
    m.courseBooking.aggregate.mockResolvedValue({ _sum: { pointCost: 2 } });
    await expect(
      correctCourseAttendance(tx, actor, "b", "ATTENDED", "NO_SHOW"),
    ).rejects.toThrow("額度不足");
    expect(m.coursePointCard.update).not.toHaveBeenCalled();
  });
  it("rejects stale status and cancelled bookings", async () => {
    m.courseBooking.findFirst.mockResolvedValue(booking("NO_SHOW"));
    await expect(
      correctCourseAttendance(tx, actor, "b", "RESERVED", "ATTENDED"),
    ).rejects.toThrow("已更新");
    m.courseBooking.findFirst.mockResolvedValue(booking("CANCELLED"));
    await expect(
      correctCourseAttendance(tx, actor, "b", "RESERVED", "CANCELLED"),
    ).rejects.toThrow("無法更正");
  });
});

it.each([['NO_SHOW','ATTENDED',0],['RESERVED','NO_SHOW',-3],['NO_SHOW','RESERVED',3]] as const)('term correction %s → %s changes quota by %s',async(before,after,delta)=>{
 m.courseBooking.findFirst.mockResolvedValue({...booking(before),card:{remaining:7,termSessionIds:['session']}});
 await correctCourseAttendance(tx,actor,'b',after,before);
 if(delta)expect(m.coursePointCard.update).toHaveBeenCalledWith({where:{id:'c'},data:{remaining:{increment:delta}}});
 else expect(m.coursePointCard.update).not.toHaveBeenCalled();
});
