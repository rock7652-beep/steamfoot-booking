import { beforeEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/feature-gate", () => ({ getStoreLimitsByStoreId: vi.fn() }));
vi.mock("@/server/services/course-access", () => ({
  courseTransaction: vi.fn(),
}));
import { correctCourseAttendance } from "@/server/services/course-booking";
import type { Prisma } from "../../generated/course-client";
const m = {
  courseBooking: { findFirst: vi.fn(), aggregate: vi.fn(), count: vi.fn(), update: vi.fn() },
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
  m.courseBooking.count.mockImplementation(async ({where}) => where.customerId ? 0 : 1);
  m.courseBooking.update.mockImplementation(async (x) => x.data);
});

describe("restore music student leave", () => {
  const leave = () => ({ ...booking("CANCELLED"), sessionId: "session", customerId: "student", absenceKind: "STUDENT_LEAVE", session: { startsAt: new Date("2020-01-01"), cancelledAt: null, capacity: 2 }, card: { remaining: 3, closedAt: null, expiresAt: new Date("2099-01-01") } });

  it("restores a seat and its reserved lesson without charging a second time", async () => {
    m.courseBooking.findFirst.mockResolvedValue(leave());
    await correctCourseAttendance(tx, actor, "b", "RESERVED", "CANCELLED");
    expect(m.coursePointCard.update).not.toHaveBeenCalled();
    expect(m.coursePointEntry.create.mock.calls[0][0].data.kind).toMatch(/^CORRECT:CANCELLED:RESERVED:/);
    expect(m.courseBooking.update).toHaveBeenCalledWith({where:{id:"b"},data:{status:"RESERVED",absenceKind:null,checkedInAt:null}});
    m.courseBooking.findFirst.mockResolvedValue({...leave(),status:"RESERVED",absenceKind:null});
    await correctCourseAttendance(tx, actor, "b", "RESERVED", "CANCELLED");
    expect(m.coursePointEntry.create).toHaveBeenCalledTimes(1);
  });

  it("returns the forfeited group lesson when restoring leave to pending", async () => {
    m.courseBooking.findFirst.mockResolvedValue({...leave(),absenceKind:"GROUP_LEAVE_FORFEITED",card:{...leave().card,remaining:0}});
    await correctCourseAttendance(tx,actor,"b","RESERVED","CANCELLED");
    expect(m.coursePointCard.update).toHaveBeenCalledWith({where:{id:"c"},data:{remaining:{increment:3}}});
    expect(m.coursePointEntry.create.mock.calls[0][0].data.kind).toMatch(/^CORRECT:CANCELLED:RESERVED:/);
    expect(m.courseBooking.update).toHaveBeenCalledWith({where:{id:"b"},data:{status:"RESERVED",absenceKind:null,checkedInAt:null}});
  });
  it("reopens a music card when its first deducted lesson is restored",async()=>{
    m.courseBooking.findFirst.mockResolvedValueOnce({...leave(),absenceKind:"GROUP_LEAVE_FORFEITED",card:{...leave().card,remaining:0,musicValidityDays:35,musicActivatedAt:new Date("2020-01-01")}}).mockResolvedValueOnce(null);
    await correctCourseAttendance(tx,actor,"b","RESERVED","CANCELLED");
    expect(m.coursePointCard.update).toHaveBeenCalledWith({where:{id:"c"},data:{remaining:{increment:3},musicActivatedAt:null,expiresAt:expect.any(Date)}});
  });

  it("refuses to restore a forfeited group seat after capacity is filled", async () => {
    m.courseBooking.findFirst.mockResolvedValue({...leave(),absenceKind:"GROUP_LEAVE_FORFEITED",card:{...leave().card,remaining:0}});
    m.courseBooking.count.mockImplementation(async ({where}) => where.customerId ? 0 : 2);
    await expect(correctCourseAttendance(tx,actor,"b","RESERVED","CANCELLED")).rejects.toThrow("名額已滿");
    expect(m.coursePointCard.update).not.toHaveBeenCalled();
  });

  it("refuses restoration if someone took the seat or remaining lessons are held", async () => {
    m.courseBooking.findFirst.mockResolvedValue(leave());
    m.courseBooking.count.mockImplementation(async ({where}) => where.customerId ? 0 : 2);
    await expect(correctCourseAttendance(tx,actor,"b","RESERVED","CANCELLED")).rejects.toThrow("名額已滿");
    m.courseBooking.count.mockImplementation(async ({where}) => where.customerId ? 0 : 1);
    m.courseBooking.aggregate.mockResolvedValue({_sum:{pointCost:1}});
    await expect(correctCourseAttendance(tx,actor,"b","RESERVED","CANCELLED")).rejects.toThrow("額度不足");
    expect(m.courseBooking.update).not.toHaveBeenCalled();
  });

  it("does not reopen an administrative cancellation", async () => {
    m.courseBooking.findFirst.mockResolvedValue({...leave(),absenceKind:null});
    await expect(correctCourseAttendance(tx,actor,"b","RESERVED","CANCELLED")).rejects.toThrow("無法更正");
  });

  it("refuses to restore if the same learner already has another active booking", async () => {
    m.courseBooking.findFirst.mockResolvedValue({...leave(),customerId:"student"});
    m.courseBooking.count.mockImplementation(async ({where}) => where.customerId ? 1 : 1);
    await expect(correctCourseAttendance(tx,actor,"b","RESERVED","CANCELLED")).rejects.toThrow("重複恢復");
    expect(m.courseBooking.update).not.toHaveBeenCalled();
  });
});
describe("course attendance correction", () => {
  it("starts a new music plan from the first lesson when attendance is marked in a batch", async () => {
    m.courseBooking.findFirst.mockResolvedValue({ ...booking("RESERVED"), card: {remaining:7,musicValidityDays:35,musicActivatedAt:null,expiresAt:new Date("2099-12-31")} });
    await correctCourseAttendance(tx,actor,"b","ATTENDED","RESERVED");
    expect(m.coursePointCard.update).toHaveBeenCalledWith({where:{id:"c"},data:{remaining:{increment:-3},musicActivatedAt:new Date("2020-01-01"),expiresAt:expect.any(Date)}});
  });
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
  it("keeps the single debit when correcting no-show to attended", async () => {
    m.courseBooking.findFirst.mockResolvedValue(booking("NO_SHOW"));
    await correctCourseAttendance(tx, actor, "b", "ATTENDED", "NO_SHOW");
    expect(m.coursePointCard.update).not.toHaveBeenCalled();
    m.courseBooking.findFirst.mockResolvedValue(booking("ATTENDED"));
    await correctCourseAttendance(tx, actor, "b", "ATTENDED", "NO_SHOW");
    expect(m.coursePointCard.update).not.toHaveBeenCalled();
  });
  it("rejects spending held by other bookings", async () => {
    m.courseBooking.findFirst.mockResolvedValue(booking("RESERVED", 3));
    m.courseBooking.aggregate.mockResolvedValue({ _sum: { pointCost: 2 } });
    await expect(
      correctCourseAttendance(tx, actor, "b", "ATTENDED", "RESERVED"),
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
