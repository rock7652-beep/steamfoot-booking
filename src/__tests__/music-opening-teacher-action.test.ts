import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({manager:vi.fn(),transaction:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager,courseTransaction:m.transaction}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{}}));
vi.mock("@/lib/db",()=>({prisma:{}}));
vi.mock("@/lib/auth",()=>({auth:vi.fn()}));
vi.mock("@/lib/feature-gate",()=>({getStoreLimitsByStoreId:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn(),unstable_cache:(fn:unknown)=>fn}));
vi.mock("next/server",()=>({after:vi.fn()}));
import {markCourseTeacherAttendance} from "@/server/actions/course-members";
import {syntheticOpeningBooking,syntheticOpeningScope} from "./fixtures/music-opening";
let booking=syntheticOpeningBooking("ATTENDED");
const tx={
  courseSession:{findFirst:vi.fn(),updateMany:vi.fn(),update:vi.fn()},
  courseBooking:{findMany:vi.fn(),findFirst:vi.fn(),count:vi.fn(),aggregate:vi.fn(),update:vi.fn()},
  coursePointCard:{update:vi.fn(),findUnique:vi.fn()},coursePointEntry:{create:vi.fn()},$executeRaw:vi.fn(),
};
beforeEach(()=>{
  vi.resetAllMocks();booking=syntheticOpeningBooking("ATTENDED");
  m.manager.mockResolvedValue({storeId:syntheticOpeningScope.targetStoreId,user:{id:"synthetic-manager",name:"Synthetic manager"}});
  m.transaction.mockImplementation(async(_store,work)=>work(tx));
  tx.courseSession.findFirst.mockImplementation(async()=>({...booking.session,releasedAt:null,teacherAttendanceReason:"",teacherAttendanceAt:null,teacherAttendanceById:null}));
  tx.courseSession.updateMany.mockImplementation(async({data})=>{booking.session.teacherAttendance=data.teacherAttendance;return {count:1};});
  tx.courseBooking.findMany.mockImplementation(async({where})=>where.status==="CANCELLED"?[{id:booking.id}]:[booking]);
  tx.courseBooking.findFirst.mockImplementation(async({where})=>where.makeupForBookingId?null:booking);tx.courseBooking.count.mockResolvedValue(0);tx.courseBooking.aggregate.mockResolvedValue({_sum:{pointCost:0}});
  tx.courseBooking.update.mockImplementation(async({data})=>{Object.assign(booking,data);return booking;});
  tx.coursePointCard.update.mockImplementation(async({data})=>{if(data.remaining)booking.card.remaining+=data.remaining.increment;return booking.card;});
});
it.each(["LEAVE","NO_SHOW"] as const)("actual teacher %s action and restoration preserve original opening dates and balance",async status=>{
  const originalDates=[booking.card.musicActivatedAt!.toISOString(),booking.card.expiresAt.toISOString()];
  expect(await markCourseTeacherAttendance({sessionId:booking.sessionId,status,expectedStatus:"SCHEDULED"})).toMatchObject({success:true});
  expect(booking.card.remaining).toBe(2);expect(booking.status).toBe("CANCELLED");expect(booking.absenceKind).toBe("TEACHER_ABSENT");
  expect(await markCourseTeacherAttendance({sessionId:booking.sessionId,status:"SCHEDULED",expectedStatus:status})).toMatchObject({success:true});
  expect(booking.status).toBe("RESERVED");expect(booking.card.remaining).toBe(2);
  expect([booking.card.musicActivatedAt!.toISOString(),booking.card.expiresAt.toISOString()]).toEqual(originalDates);
  expect(tx.coursePointCard.update).toHaveBeenCalledTimes(1);
  expect(tx.coursePointCard.update.mock.calls[0][0].data).toEqual({remaining:{increment:1}});
});
