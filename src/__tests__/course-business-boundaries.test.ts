import { describe, expect, it, vi } from "vitest";
import { courseDebitPolicy } from "@/lib/course-debit-policy";
import { readCourseBusinessProfile } from "@/server/services/course-business-profile";
import { validateFitnessPurchase } from "@/server/services/course-purchase-rules";
import type { Prisma } from "../../generated/course-client";
import type { CourseCheckoutInput } from "@/lib/course-checkout";
import { settleCourseBooking } from "@/server/services/course-booking";

vi.mock("@/server/services/course-access", () => ({courseTransaction:vi.fn()}));
vi.mock("@/lib/feature-gate", () => ({getStoreLimitsByStoreId:vi.fn()}));
vi.mock("@/server/services/course-store-notices", () => ({recordCourseStoreNotice:vi.fn()}));

function memberLeaveFixture(music = true, classType = "GROUP") {
  const booking = {
    id:"booking",storeId:"store",sessionId:"session",cardId:"card",customerId:"learner",
    reserverCustomerId:null,status:"RESERVED",absenceKind:null as string|null,pointCost:1,
    card:{members:[{customerId:"learner"}],musicValidityDays:null},
    session:{templateId:"template",teacherAttendance:"SCHEDULED",startsAt:new Date("2099-01-01T02:00:00Z")},
  };
  const reader = {
    courseBooking:{findFirst:vi.fn().mockResolvedValue(booking),update:vi.fn().mockImplementation(async ({data}) => Object.assign(booking,data))},
    courseBookingRule:{findUnique:vi.fn().mockResolvedValue({selfLeaveEnabled:true,cancellationLeadMinutes:0})},
    courseTemplate:{findFirst:vi.fn().mockResolvedValue({classType})},
    courseSession:{findFirst:vi.fn().mockResolvedValue(null)},
    coursePointCard:{updateMany:vi.fn().mockResolvedValue({count:1})},
    coursePointEntry:{findUnique:vi.fn().mockResolvedValue(null),create:vi.fn()},
    $queryRaw:vi.fn().mockResolvedValue(music?[{featureKey:"business.music"}]:[]),
  };
  return {booking,reader,tx:reader as unknown as Prisma.TransactionClient,
    actor:{storeId:"store",userId:"member-user",name:"學員",customerId:"learner"}};
}

describe("member leave authorization and industry debit rules", () => {
  it("allows an authorized music member's group leave to forfeit one lesson only once", async () => {
    const {tx,reader,actor}=memberLeaveFixture();
    expect(await settleCourseBooking(tx,actor,"booking","STUDENT_LEAVE")).toMatchObject({status:"CANCELLED",absenceKind:"GROUP_LEAVE_FORFEITED"});
    await settleCourseBooking(tx,actor,"booking","STUDENT_LEAVE");
    expect(reader.coursePointCard.updateMany).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({data:{remaining:{decrement:1}}}));
    expect(reader.coursePointEntry.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({data:expect.objectContaining({kind:"DEBIT",points:1,actorUserId:actor.userId})}));
  });

  it.each(["ATTENDED","CHECKED_IN","NO_SHOW"] as const)("still rejects member attendance target %s", async target => {
    const {tx,reader,actor}=memberLeaveFixture();
    await expect(settleCourseBooking(tx,actor,"booking",target)).rejects.toThrow("點名僅限有權限的人員");
    expect(reader.coursePointCard.updateMany).not.toHaveBeenCalled();
    expect(reader.courseBooking.update).not.toHaveBeenCalled();
  });

  it("applies music group forfeiture even when a member submits CANCELLED", async () => {
    const {tx,reader,actor}=memberLeaveFixture();
    expect(await settleCourseBooking(tx,actor,"booking","CANCELLED")).toMatchObject({status:"CANCELLED",absenceKind:"GROUP_LEAVE_FORFEITED"});
    await settleCourseBooking(tx,actor,"booking","CANCELLED");
    expect(reader.coursePointCard.updateMany).toHaveBeenCalledOnce();
    expect(reader.coursePointEntry.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({data:expect.objectContaining({kind:"DEBIT"})}));
  });

  it("does not forfeit a group lesson when an authorized reschedule releases the old reservation", async () => {
    const {tx,reader,actor}=memberLeaveFixture();
    expect(await settleCourseBooking(tx,actor,"booking","CANCELLED","DEDUCTED",{memberReschedule:true})).toMatchObject({status:"CANCELLED",absenceKind:null});
    expect(reader.coursePointCard.updateMany).not.toHaveBeenCalled();
    expect(reader.coursePointEntry.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({kind:"RELEASE"})}));
  });

  it("does not turn a teacher absence into a member group-leave deduction", async () => {
    const {tx,reader,actor,booking}=memberLeaveFixture();
    booking.session.teacherAttendance="LEAVE";
    await expect(settleCourseBooking(tx,actor,"booking","CANCELLED")).rejects.toThrow("教師未授課");
    expect(reader.coursePointCard.updateMany).not.toHaveBeenCalled();
  });

  it("rejects another member before any balance mutation", async () => {
    const {tx,reader,actor}=memberLeaveFixture();
    await expect(settleCourseBooking(tx,{...actor,customerId:"other-member"},"booking","STUDENT_LEAVE")).rejects.toThrow("無權操作");
    expect(reader.coursePointCard.updateMany).not.toHaveBeenCalled();
    expect(reader.courseBooking.update).not.toHaveBeenCalled();
  });

  it("keeps the self-leave switch and cancellation cutoff authoritative", async () => {
    const {tx,reader,actor,booking}=memberLeaveFixture();
    reader.courseBookingRule.findUnique.mockResolvedValue({selfLeaveEnabled:false,cancellationLeadMinutes:0});
    await expect(settleCourseBooking(tx,actor,"booking","STUDENT_LEAVE")).rejects.toThrow("請假請聯繫店家");
    reader.courseBookingRule.findUnique.mockResolvedValue({selfLeaveEnabled:true,cancellationLeadMinutes:0});
    booking.session.startsAt=new Date("2000-01-01T02:00:00Z");
    await expect(settleCourseBooking(tx,actor,"booking","STUDENT_LEAVE")).rejects.toThrow("取消截止時間");
    expect(reader.coursePointCard.updateMany).not.toHaveBeenCalled();
    expect(reader.courseBooking.update).not.toHaveBeenCalled();
  });

  it.each([[true,"PRIVATE"],[false,"GROUP"]] as const)("releases individual music and sports leave without debit (%s/%s)", async (music,classType) => {
    const {tx,reader,actor}=memberLeaveFixture(music,classType);
    expect(await settleCourseBooking(tx,actor,"booking","STUDENT_LEAVE")).toMatchObject({status:"CANCELLED",absenceKind:"STUDENT_LEAVE"});
    expect(reader.coursePointCard.updateMany).not.toHaveBeenCalled();
    expect(reader.coursePointEntry.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({kind:"RELEASE"})}));
  });
});

describe("course business boundaries", () => {
  it("reads each store through the supplied transaction without retaining another store's profile", async () => {
    const raw = vi.fn().mockResolvedValueOnce([{featureKey:"business.music"}]).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("database unavailable"));
    const reader = {$queryRaw:raw} as unknown as Pick<Prisma.TransactionClient,"$queryRaw">;
    expect(await readCourseBusinessProfile(reader,"music-store")).toBe("MUSIC");
    expect(await readCourseBusinessProfile(reader,"fitness-store")).toBe("FITNESS");
    expect(raw.mock.calls.map(call => call.slice(1))).toEqual([["music-store"],["fitness-store"]]);
    await expect(readCourseBusinessProfile(reader,"music-store")).rejects.toThrow("database unavailable");
  });

  it("forfeits music group leave while releasing sports and individual music leave", () => {
    const leave = {target:"STUDENT_LEAVE" as const,hasCard:true,classType:"GROUP"};
    expect(courseDebitPolicy("MUSIC",leave)).toMatchObject({shouldDebit:true,groupLeaveForfeited:true});
    expect(courseDebitPolicy("FITNESS",leave)).toMatchObject({shouldDebit:false,groupLeaveForfeited:false});
    expect(courseDebitPolicy("MUSIC",{...leave,classType:"INDIVIDUAL"}).shouldDebit).toBe(false);
    expect(courseDebitPolicy("MUSIC",{...leave,hasCard:false}).shouldDebit).toBe(false);
  });

  it("deducts paid no-shows in both businesses without issuing a no-show makeup voucher", () => {
    const missed = {target:"NO_SHOW" as const,hasCard:true};
    expect(courseDebitPolicy("MUSIC",missed)).toMatchObject({shouldDebit:true,allowsNoShowMakeup:false});
    expect(courseDebitPolicy("FITNESS",missed)).toMatchObject({shouldDebit:true,allowsNoShowMakeup:false});
    for (const profile of ["MUSIC","FITNESS"] as const) {
      expect(courseDebitPolicy(profile,{...missed,hasCard:false}).shouldDebit).toBe(false);
      expect(courseDebitPolicy(profile,{target:"CANCELLED",hasCard:true}).shouldDebit).toBe(false);
      expect(courseDebitPolicy(profile,{target:"CHECKED_IN",hasCard:true}).shouldDebit).toBe(false);
    }
  });

  it.each([{musicPurchaseTerms:2},{musicManualBonus:1},{musicJoinSessionId:"session"},{musicValidityDays:30}])("rejects music purchase options on sports checkout: %j", data => {
    expect(() => validateFitnessPurchase(data as CourseCheckoutInput)).toThrow("此方案不適用音樂課程設定");
  });
});
