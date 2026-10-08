import {beforeEach,describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/feature-gate",()=>({getStoreLimitsByStoreId:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseTransaction:vi.fn()}));
import {correctCourseAttendance,refundTeacherAbsentSession,reserveCourseInTransaction,settleCourseBooking} from "@/server/services/course-booking";
import {syntheticOpeningBooking,syntheticOpeningCard,syntheticOpeningRecord,syntheticOpeningScope} from "./fixtures/music-opening";
import type {Prisma} from "../../generated/course-client";
const m={courseBooking:{findFirst:vi.fn(),findMany:vi.fn(),findUnique:vi.fn(),aggregate:vi.fn(),count:vi.fn(),create:vi.fn(),update:vi.fn()},
  coursePointCard:{findFirst:vi.fn(),findUnique:vi.fn(),update:vi.fn(),updateMany:vi.fn()},coursePointEntry:{create:vi.fn(),findUnique:vi.fn()},
  courseSession:{findFirst:vi.fn(),update:vi.fn()},courseTemplate:{findFirst:vi.fn()},courseBookingRule:{findUnique:vi.fn()},$queryRaw:vi.fn(),$executeRaw:vi.fn()};
const tx=m as unknown as Prisma.TransactionClient;
const actor={storeId:syntheticOpeningScope.targetStoreId,userId:"synthetic-staff",name:"Synthetic staff"};
beforeEach(()=>{
  vi.resetAllMocks();m.courseBooking.aggregate.mockResolvedValue({_sum:{pointCost:0}});m.courseBooking.count.mockResolvedValue(0);
  m.coursePointCard.updateMany.mockResolvedValue({count:1});m.courseBooking.update.mockImplementation(async({data})=>data);
  m.courseSession.findFirst.mockResolvedValue(null);m.$queryRaw.mockResolvedValue([{featureKey:"business.music",id:"synthetic-student"}]);
  m.courseTemplate.findFirst.mockResolvedValue({classType:"PRIVATE"});m.coursePointCard.findUnique.mockResolvedValue(null);
});
describe("real attendance services with synthetic opening rows",()=>{
  it.each(["ATTENDED","NO_SHOW"] as const)("%s consumes exactly one current lesson without resetting original dates",async target=>{
    const booking=syntheticOpeningBooking();m.courseBooking.findFirst.mockResolvedValue(booking);
    await settleCourseBooking(tx,actor,booking.id,target);
    expect(m.coursePointCard.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:{remaining:{decrement:1}}}));
    expect(booking.card.musicActivatedAt!.toISOString()).toBe("2026-09-15T02:00:00.000Z");
    expect(booking.musicOpeningLessonOrdinal).toBe(3);
  });
  it("group leave debits one; private leave does not debit",async()=>{
    m.courseBooking.findFirst.mockResolvedValue(syntheticOpeningBooking());m.courseTemplate.findFirst.mockResolvedValue({classType:"GROUP"});
    await settleCourseBooking(tx,actor,"synthetic-booking","STUDENT_LEAVE");expect(m.coursePointCard.updateMany).toHaveBeenCalledTimes(1);
    expect(m.courseBooking.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({absenceKind:"GROUP_LEAVE_FORFEITED"})}));
    vi.clearAllMocks();m.courseBooking.findFirst.mockResolvedValue(syntheticOpeningBooking());m.courseTemplate.findFirst.mockResolvedValue({classType:"PRIVATE"});
    await settleCourseBooking(tx,actor,"synthetic-booking","STUDENT_LEAVE");expect(m.coursePointCard.updateMany).not.toHaveBeenCalled();
  });
  it.each(["ATTENDED","NO_SHOW"])("restoring the only %s local lesson preserves opening validity",async status=>{
    const booking=syntheticOpeningBooking(status);m.courseBooking.findFirst.mockResolvedValue(booking);
    await correctCourseAttendance(tx,actor,booking.id,"RESERVED",status);
    expect(m.coursePointCard.update).toHaveBeenCalledWith({where:{id:booking.cardId},data:{remaining:{increment:1}}});
    expect(m.courseBooking.findFirst).toHaveBeenCalledTimes(1);
  });
  it("restores forfeited group leave and never creates a historical attendance",async()=>{
    const booking=syntheticOpeningBooking("CANCELLED");booking.absenceKind="GROUP_LEAVE_FORFEITED";booking.card.remaining=1;
    m.courseBooking.findFirst.mockResolvedValue(booking);
    await correctCourseAttendance(tx,actor,booking.id,"RESERVED","CANCELLED");
    expect(m.coursePointCard.update).toHaveBeenCalledWith({where:{id:booking.cardId},data:{remaining:{increment:1}}});
    expect(m.courseBooking.create).not.toHaveBeenCalled();
  });
  it("keeps repeat and stale-status safeguards",async()=>{
    const booking=syntheticOpeningBooking("ATTENDED");m.courseBooking.findFirst.mockResolvedValue(booking);
    await settleCourseBooking(tx,actor,booking.id,"ATTENDED");expect(m.coursePointCard.updateMany).not.toHaveBeenCalled();
    await expect(correctCourseAttendance(tx,actor,booking.id,"NO_SHOW","RESERVED")).rejects.toThrow("另一位人員");
    expect(m.coursePointCard.update).not.toHaveBeenCalled();
  });
  it("teacher absence returns only post-cutoff debit and never un-activates the card",async()=>{
    const booking=syntheticOpeningBooking("ATTENDED");m.courseBooking.findMany.mockResolvedValue([booking]);
    await refundTeacherAbsentSession(tx,actor,booking.sessionId);
    expect(m.coursePointCard.update).toHaveBeenCalledTimes(1);
    expect(m.coursePointCard.update).toHaveBeenCalledWith({where:{id:booking.cardId},data:{remaining:{increment:1}}});
    expect(m.courseBooking.findFirst).not.toHaveBeenCalled();
    m.courseBooking.findMany.mockResolvedValue([]);await refundTeacherAbsentSession(tx,actor,booking.sessionId);
    expect(m.coursePointCard.update).toHaveBeenCalledTimes(1);
  });
  it("blocks duplicate original ordinals even if source lesson IDs differ",async()=>{
    const first=syntheticOpeningBooking("ATTENDED");const second={...syntheticOpeningBooking("ATTENDED"),id:"duplicate",musicOpeningSourceLessonKey:"different-source-id"};
    m.courseBooking.findMany.mockResolvedValue([first,second]);
    await expect(refundTeacherAbsentSession(tx,actor,first.sessionId)).rejects.toThrow("來源堂次重複");
    expect(m.coursePointCard.update).not.toHaveBeenCalled();expect(m.courseBooking.update).not.toHaveBeenCalled();
  });
  it("preflights every learner before any teacher-absence batch write",async()=>{
    const first=syntheticOpeningBooking("ATTENDED");const second={...syntheticOpeningBooking("ATTENDED"),id:"bad",pointCost:5};
    m.courseBooking.findMany.mockResolvedValue([first,second]);
    await expect(refundTeacherAbsentSession(tx,actor,first.sessionId)).rejects.toThrow("特殊扣堂");
    expect(m.coursePointCard.update).not.toHaveBeenCalled();expect(m.coursePointEntry.create).not.toHaveBeenCalled();expect(m.$executeRaw).not.toHaveBeenCalled();
  });
  it.each(["reservedAtCutoff","unresolvedMakeupLessons"] as const)("unresolved %s blocks mutation before writes",async field=>{
    const record=syntheticOpeningRecord();record.balance[field]=1;
    const booking={...syntheticOpeningBooking(),card:syntheticOpeningCard(record)};m.courseBooking.findFirst.mockResolvedValue(booking);
    await expect(settleCourseBooking(tx,actor,booking.id,"ATTENDED")).rejects.toThrow("來源連結");
    expect(m.coursePointCard.updateMany).not.toHaveBeenCalled();expect(m.courseBooking.update).not.toHaveBeenCalled();
  });
  it("missing original state never falls through to 2099 or current catalogue",async()=>{
    const booking=syntheticOpeningBooking();m.courseBooking.findFirst.mockResolvedValue({...booking,card:{...booking.card,musicOpeningState:null}});
    await expect(correctCourseAttendance(tx,actor,booking.id,"ATTENDED","RESERVED")).rejects.toThrow("資料缺漏");
    expect(m.coursePointCard.update).not.toHaveBeenCalled();
  });
  it("ordinary booking creation blocks imported cards before any reservation or grant",async()=>{
    const booking=syntheticOpeningBooking();m.courseBooking.findUnique.mockResolvedValue(null);m.courseBooking.findFirst.mockResolvedValue(null);
    m.courseSession.findFirst.mockResolvedValue(booking.session);m.coursePointCard.findFirst.mockResolvedValue(booking.card);
    await expect(reserveCourseInTransaction(tx,actor,{sessionId:booking.sessionId,cardId:booking.cardId,customerId:booking.customerId,requestKey:"synthetic-new"},null)).rejects.toThrow("先連結來源堂次");
    expect(m.courseBooking.create).not.toHaveBeenCalled();expect(m.coursePointEntry.create).not.toHaveBeenCalled();
  });
});
