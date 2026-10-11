import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({actor:vi.fn(),assert:vi.fn(),transaction:vi.fn(),booking:vi.fn(),target:vi.fn(),prior:vi.fn(),settle:vi.fn(),reserve:vi.fn(),notice:vi.fn(),limit:vi.fn(),payments:vi.fn(),refresh:vi.fn()}));
vi.mock("@/server/services/course-teacher-change-access",()=>({courseTeacherChangeActor:m.actor,assertCourseTeacherChange:m.assert}));
vi.mock("@/server/services/course-access",()=>({courseTransaction:m.transaction}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{}}));
vi.mock("@/server/services/course-booking",()=>({settleCourseBooking:m.settle,reserveCourseInTransaction:m.reserve}));
vi.mock("@/server/services/course-store-notices",()=>({recordCourseStoreNotice:m.notice}));
vi.mock("@/lib/feature-gate",()=>({getStoreLimitsByStoreId:m.limit}));
vi.mock("next/server",()=>({after:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:m.refresh}));
import {changeCourseTeacherBooking} from "@/server/actions/course-teacher-changes";
const tx={courseBooking:{findFirst:m.booking,findUnique:m.prior},courseSession:{findFirst:m.target},courseTrialPayment:{updateMany:m.payments}};
const booking=()=>({id:"b",storeId:"s",sessionId:"old",customerId:"c",customerName:"學員",status:"RESERVED",cardId:"card",card:{termSessionIds:[]},session:{startsAt:new Date("2099-10-15"),templateId:"guitar"}});
beforeEach(()=>{vi.resetAllMocks();m.actor.mockResolvedValue({storeId:"s",user:{id:"u",name:"老師"},staffId:"teacher"});m.transaction.mockImplementation(async(_s,work)=>work(tx));m.limit.mockResolvedValue({maxMonthlyBookings:null});m.booking.mockResolvedValue(booking());m.target.mockResolvedValue({id:"new",coachId:"teacher",startsAt:new Date("2099-10-16"),nameSnapshot:"吉他"});m.reserve.mockResolvedValue({id:"next"});m.settle.mockResolvedValue({id:"b"});});
it('requires the dedicated teacher leave grant and rechecks ownership inside the transaction',async()=>{
 expect(await changeCourseTeacherBooking({bookingId:"b"})).toMatchObject({success:true});
 expect(m.actor).toHaveBeenCalledWith("teacher.booking.leave",true);expect(m.assert).toHaveBeenCalledWith(tx,"s","u","teacher","old","teacher.booking.leave");expect(m.settle).toHaveBeenCalledWith(tx,{storeId:"s",userId:"u",name:"老師"},"b","STUDENT_LEAVE");
});
it('does not accept another teacher lesson or a revoked grant',async()=>{
 m.assert.mockRejectedValue(new Error('not authorized'));expect(await changeCourseTeacherBooking({bookingId:"b"})).toMatchObject({success:false});expect(m.settle).not.toHaveBeenCalled();
});
it('uses the separate reschedule grant and only same-teacher same-course targets',async()=>{
 expect(await changeCourseTeacherBooking({bookingId:"b",sessionId:"new"})).toMatchObject({success:true,bookingId:"next"});
 expect(m.actor).toHaveBeenCalledWith("teacher.booking.reschedule",true);expect(m.target).toHaveBeenCalledWith({where:{id:"new",storeId:"s",coachId:"teacher",templateId:"guitar",cancelledAt:null,startsAt:{gt:expect.any(Date)}}});
 expect(m.notice).toHaveBeenCalledTimes(1);
});
it('rejects fixed term moves before releasing the original lesson',async()=>{
 m.booking.mockResolvedValue({...booking(),card:{termSessionIds:["old"]}});expect(await changeCourseTeacherBooking({bookingId:"b",sessionId:"new"})).toMatchObject({success:false});expect(m.settle).not.toHaveBeenCalled();
});
it('lets a failed target reservation abort the transaction before receipts or notices',async()=>{
 m.reserve.mockRejectedValue(new Error('full'));expect(await changeCourseTeacherBooking({bookingId:"b",sessionId:"new"})).toMatchObject({success:false});expect(m.payments).not.toHaveBeenCalled();expect(m.notice).not.toHaveBeenCalled();
});
