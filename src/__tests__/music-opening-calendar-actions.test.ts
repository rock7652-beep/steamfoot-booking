import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({manager:vi.fn(),transaction:vi.fn(),dbTransaction:vi.fn(),session:vi.fn(),sessions:vi.fn(),bookings:vi.fn(),room:vi.fn(),raw:vi.fn(),update:vi.fn(),updateMany:vi.fn(),moves:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager,courseTransaction:m.transaction}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{$transaction:m.dbTransaction}}));
vi.mock("@/lib/db",()=>({prisma:{}}));
vi.mock("@/server/services/course-resources",()=>({assertCourseResources:vi.fn(),assertNoCourseResourceUse:vi.fn(),handleCourseActionError:(error:Error)=>({success:false,error:error.message})}));
vi.mock("@/server/services/course-availability",()=>({assertMusicCourseAvailability:vi.fn(),assertMusicCourseDuration:vi.fn()}));
vi.mock("@/server/services/course-business-hours",()=>({assertCourseSessionsFitHours:vi.fn()}));
vi.mock("@/server/services/course-duty",()=>({assertCourseDutyCoverage:vi.fn()}));
vi.mock("@/server/services/course-coach-notification-kick",()=>({kickCoachNotifications:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("next/server",()=>({after:vi.fn()}));
import {moveCourseSessions,updateCourseSession,updateCourseSeries} from "@/server/actions/course";
import {syntheticOpeningBooking,syntheticOpeningScope} from "./fixtures/music-opening";
import {MUSIC_OPENING_CALENDAR_BOOKINGS} from "@/lib/music-opening-runtime";
let booking=syntheticOpeningBooking("CANCELLED");
let session={...booking.session,bookings:[booking],roomId:"synthetic-room",coachId:"synthetic-teacher",pointCost:1,nameSnapshot:"Synthetic class",rescheduledFromStartsAt:null};
const tx={courseSession:{findFirst:m.session,findMany:m.sessions,update:m.update,updateMany:m.updateMany},courseBooking:{findMany:m.bookings},courseRoom:{findFirst:m.room},courseSessionMove:{create:m.moves},$queryRaw:m.raw};
beforeEach(()=>{
  vi.resetAllMocks();booking=syntheticOpeningBooking("CANCELLED");booking.absenceKind="STUDENT_LEAVE";
  session={...booking.session,bookings:[booking],roomId:"synthetic-room",coachId:"synthetic-teacher",pointCost:1,nameSnapshot:"Synthetic class",rescheduledFromStartsAt:null};
  m.manager.mockResolvedValue({storeId:syntheticOpeningScope.targetStoreId,user:{id:"synthetic-manager",name:"Synthetic"}});
  m.transaction.mockImplementation(async(_store,work)=>work(tx));m.dbTransaction.mockImplementation(async work=>work(tx));
  m.session.mockImplementation(async({where})=>typeof where.id==="string"?session:null);m.sessions.mockResolvedValue([session]);m.bookings.mockResolvedValue([booking]);m.room.mockResolvedValue({id:session.roomId});m.raw.mockResolvedValue([{id:"synthetic-staff-or-store"}]);m.update.mockResolvedValue(session);
});
const request=(date:string)=>({id:"synthetic-session",date,time:"10:00",roomId:"synthetic-room",coachId:"synthetic-teacher",durationMinutes:60,capacity:3,pointCost:1,nameSnapshot:"Synthetic class"});
describe("real calendar actions preserve canceled imported history",()=>{
  it.each(["single","move","series"])("%s checks canceled imported rows before moving across cutoff",async kind=>{
    const input=request("2026-09-30");
    const result=kind==="single"?await updateCourseSession(input):kind==="series"?await updateCourseSeries(input):await moveCourseSessions({...input,scope:"SINGLE"});
    expect(result).toMatchObject({success:false,error:expect.stringContaining("切點前")});
    expect(m.update).not.toHaveBeenCalled();expect(m.updateMany).not.toHaveBeenCalled();expect(m.moves).not.toHaveBeenCalled();
    if(kind==="single")expect(m.bookings.mock.calls[0][0].where).toMatchObject(MUSIC_OPENING_CALENDAR_BOOKINGS);
    else expect((kind==="move"?m.session:m.sessions).mock.calls[0][0].include.bookings.where).toEqual(MUSIC_OPENING_CALENDAR_BOOKINGS);
  });
  it.each(["GROUP_LEAVE_FORFEITED","STUDENT_LEAVE","TEACHER_ABSENT"])("%s cannot move after the original expiry",async absenceKind=>{
    booking.absenceKind=absenceKind;
    expect(await moveCourseSessions({...request("2026-12-01"),scope:"SINGLE"})).toMatchObject({success:false,error:expect.stringContaining("有效期限")});
    expect(m.updateMany).not.toHaveBeenCalled();
  });
  it("canceled imported rows do not occupy capacity when changing an otherwise valid session",async()=>{
    const second={...booking,id:"synthetic-second",musicOpeningSourceLessonKey:"synthetic-other-source",musicOpeningLessonOrdinal:4};m.bookings.mockResolvedValue([booking,second]);
    const result=await updateCourseSession({...request("2026-10-15"),capacity:1});
    expect(result).toMatchObject({success:true});expect(m.update).toHaveBeenCalled();
  });
});
