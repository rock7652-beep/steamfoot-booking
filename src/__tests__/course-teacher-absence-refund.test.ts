import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/feature-gate", () => ({ getStoreLimitsByStoreId: vi.fn() }));
vi.mock("@/server/services/course-access", () => ({ courseTransaction: vi.fn() }));
import { refundTeacherAbsentSession, correctCourseAttendance, settleCourseBooking } from "@/server/services/course-booking";
import type { Prisma } from "../../generated/course-client";
const m = {
  courseBooking: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), aggregate: vi.fn(), count: vi.fn() },
  coursePointCard: { update: vi.fn() }, coursePointEntry: { create: vi.fn() },
  courseSession: { findFirst: vi.fn(), update: vi.fn() }, $executeRaw: vi.fn(),
};
const tx = m as unknown as Prisma.TransactionClient;
const actor = { storeId: "store", userId: "manager", name: "店長" };
const row = (id: string, status: string, absenceKind: string | null = null, cardId: string | null = "shared") => ({
  id, status, absenceKind, cardId, pointCost: cardId ? 2 : 0, checkedInAt: null,
  card: cardId ? { musicValidityDays: null } : null,
});
beforeEach(() => {
  vi.resetAllMocks();
  m.courseBooking.findFirst.mockResolvedValue(null);
  m.courseBooking.update.mockImplementation(async input => input.data);
});
describe("teacher absence refunds", () => {
  it("returns each actual shared-card deduction, releases reservations, and never changes trial money", async () => {
    m.courseBooking.findMany.mockResolvedValue([
      row("attended", "ATTENDED"), row("noshow", "NO_SHOW"), row("group", "CANCELLED", "GROUP_LEAVE_FORFEITED"),
      row("pending", "RESERVED"), row("leave", "CANCELLED", "STUDENT_LEAVE"), row("trial", "RESERVED", null, null), row("free", "RESERVED", null, null),
    ]);
    expect(await refundTeacherAbsentSession(tx, actor, "session")).toBe(7);
    expect(m.coursePointCard.update.mock.calls.map(call => call[0].data.remaining.increment)).toEqual([2, 2, 2]);
    expect(m.coursePointEntry.create).toHaveBeenCalledTimes(4);
    expect(m.coursePointEntry.create.mock.calls[3][0].data.kind).toMatch(/^RELEASE:/);
    expect(m.courseBooking.update).toHaveBeenCalledTimes(7);
    for (const [input] of m.courseBooking.update.mock.calls) expect(input.data).toEqual({status:"CANCELLED", absenceKind:"TEACHER_ABSENT", checkedInAt:null});
    expect(m.$executeRaw).toHaveBeenCalledTimes(7);
  });
  it("a second application excludes teacher markers and cannot add quota again", async () => {
    const booking = row("attended", "ATTENDED");
    m.courseBooking.findMany.mockImplementation(async ({where}) => where.OR.some((choice: {absenceKind?: {in: string[]}}) => choice.absenceKind?.in.includes(booking.absenceKind ?? "")) || booking.status !== "CANCELLED" ? [booking] : []);
    m.courseBooking.update.mockImplementation(async ({data}) => Object.assign(booking,data));
    await refundTeacherAbsentSession(tx,actor,"session");
    expect(await refundTeacherAbsentSession(tx,actor,"session")).toBe(0);
    expect(m.coursePointCard.update).toHaveBeenCalledOnce();
    expect(m.coursePointEntry.create).toHaveBeenCalledOnce();
  });
  it("recomputes a music card only after all deductions in this class have been returned", async () => {
    m.courseBooking.findMany.mockResolvedValue([ {...row("first","ATTENDED"),card:{musicValidityDays:35}}, {...row("second","NO_SHOW"),card:{musicValidityDays:35}} ]);
    await refundTeacherAbsentSession(tx,actor,"session");
    expect(m.coursePointCard.update).toHaveBeenLastCalledWith({where:{id:"shared"},data:{musicActivatedAt:null,expiresAt:expect.any(Date)}});
    expect(m.courseBooking.findFirst).toHaveBeenCalledOnce();
  });
  it("restoration reserves the returned quota without debiting it", async () => {
    m.courseBooking.findFirst.mockResolvedValue({...row("booking","CANCELLED","TEACHER_ABSENT"),sessionId:"session",customerId:"student",session:{teacherAttendance:"SCHEDULED",cancelledAt:null,capacity:10,startsAt:new Date("2026-10-01")},card:{remaining:8,closedAt:null,expiresAt:new Date("2099-01-01")}});
    m.courseBooking.count.mockResolvedValue(0);
    m.courseBooking.aggregate.mockResolvedValue({_sum:{pointCost:0}});
    m.courseSession.findFirst.mockResolvedValue({teacherAttendance:"SCHEDULED",releasedAt:null});
    await correctCourseAttendance(tx,actor,"booking","RESERVED","CANCELLED");
    expect(m.coursePointCard.update).not.toHaveBeenCalled();
    expect(m.coursePointEntry.create.mock.calls[0][0].data.kind).toMatch(/^CORRECT:CANCELLED:RESERVED:/);
  });
  it.each(["LEAVE","NO_SHOW"])("blocks settlement and correction when teacher status is %s", async teacherAttendance => {
    m.courseBooking.findFirst.mockResolvedValue({...row("booking","RESERVED"),session:{teacherAttendance,cancelledAt:null},card:{members:[]}});
    await expect(settleCourseBooking(tx,actor,"booking","ATTENDED")).rejects.toThrow("教師未授課");
    await expect(correctCourseAttendance(tx,actor,"booking","ATTENDED","RESERVED")).rejects.toThrow("教師未授課");
    expect(m.coursePointCard.update).not.toHaveBeenCalled();
    expect(m.courseBooking.update).not.toHaveBeenCalled();
  });
});
