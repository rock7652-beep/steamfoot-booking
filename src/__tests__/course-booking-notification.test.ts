import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({member:vi.fn(),transaction:vi.fn(),booking:vi.fn(),prior:vi.fn(),target:vi.fn(),raw:vi.fn(),exec:vi.fn(),reserve:vi.fn(),settle:vi.fn(),limits:vi.fn(),payments:vi.fn(),rules:vi.fn(),sessions:vi.fn(),config:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseMember:m.member,courseTransaction:m.transaction}));
vi.mock("@/server/services/course-booking",()=>({reserveCourseInTransaction:m.reserve,settleCourseBooking:m.settle}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{courseBooking:{findFirst:m.booking},courseBookingRule:{findUnique:m.rules},courseSession:{findMany:m.sessions}}}));
vi.mock("@/lib/db",()=>({prisma:{shopConfig:{findUnique:m.config}}}));
vi.mock("@/lib/feature-gate",()=>({getStoreLimitsByStoreId:m.limits}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("next/server",()=>({after:vi.fn()}));
import {confirmMemberCourseTrial,rescheduleMemberCourseBooking,loadCourseBookingNotification} from "@/server/actions/course-booking-notification";
const tx={courseBookingRule:{findUnique:m.rules},courseBooking:{findFirst:m.booking,findUnique:m.prior},courseSession:{findFirst:m.target},courseTrialPayment:{updateMany:m.payments},$queryRaw:m.raw,$executeRaw:m.exec};
const original=()=>({id:"old",storeId:"s",customerId:"member",customerName:"小美",status:"RESERVED",bookingKind:"TRIAL",cardId:null,card:null,trialPrice:500,sessionId:"original",session:{templateId:"t",startsAt:new Date("2099-10-07T15:00:00+08:00"),cancelledAt:null}});
beforeEach(()=>{vi.resetAllMocks();m.member.mockResolvedValue({user:{id:"u"},storeId:"s",customer:{id:"member",name:"小美"}});m.transaction.mockImplementation(async(_s,work)=>work(tx));m.booking.mockResolvedValue(original());m.prior.mockResolvedValue(null);m.target.mockResolvedValue({id:"new-session",startsAt:new Date("2099-10-08T15:00:00+08:00")});m.raw.mockResolvedValue([{bookableUntilDate:new Date("2099-12-31T00:00:00Z"),bookingOpensAt:null,bookingWindowDays:null}]);m.reserve.mockResolvedValue({id:"new",sessionId:"new-session"});m.limits.mockResolvedValue({maxMonthlyBookings:500});});
it("records intent without attendance, balance or receipt writes",async()=>{
 expect(await confirmMemberCourseTrial("old")).toMatchObject({success:true});
 expect(m.exec.mock.calls[0][0].join("")).toContain("ON CONFLICT (id) DO NOTHING");
 expect(m.reserve).not.toHaveBeenCalled();expect(m.settle).not.toHaveBeenCalled();expect(m.payments).not.toHaveBeenCalled();
});
it("refuses cross-store and unrelated customer action links",async()=>{
 m.booking.mockResolvedValue({...original(),customerId:"someone-else"});
 expect(await confirmMemberCourseTrial("old")).toMatchObject({success:false});expect(await rescheduleMemberCourseBooking({bookingId:"old",sessionId:"new-session"})).toMatchObject({success:false});expect(m.exec).not.toHaveBeenCalled();expect(m.settle).not.toHaveBeenCalled();
 expect(m.booking).toHaveBeenCalledWith(expect.objectContaining({where:{id:"old",storeId:"s"}}));
});
it("reschedules inside one locked transaction and preserves trial receipts",async()=>{
 expect(await rescheduleMemberCourseBooking({bookingId:"old",sessionId:"new-session"})).toMatchObject({success:true,bookingId:"new"});
 expect(m.transaction).toHaveBeenCalledTimes(1);expect(m.settle).toHaveBeenCalledWith(tx,expect.objectContaining({customerId:"member"}),"old","CANCELLED");
 expect(m.reserve).toHaveBeenCalledWith(tx,expect.objectContaining({customerId:undefined}),expect.objectContaining({trialPrice:500,cardId:null,requestKey:"course-reschedule:old:new-session"}),500);
 expect(m.payments).toHaveBeenCalledWith({where:{storeId:"s",bookingId:"old"},data:{bookingId:"new"}});
});
it("propagates capacity failure out of the transaction and never moves payments",async()=>{
 m.reserve.mockRejectedValue(new Error("本堂課已滿班"));
 expect(await rescheduleMemberCourseBooking({bookingId:"old",sessionId:"new-session"})).toMatchObject({success:false});expect(m.payments).not.toHaveBeenCalled();expect(m.exec).not.toHaveBeenCalled();
});
it("retains fixed-term, makeup and checked-in lessons for staff assistance",async()=>{
 m.booking.mockResolvedValue({...original(),card:{termSessionIds:["original"],members:[{customerId:"member"}]}});
 expect(await rescheduleMemberCourseBooking({bookingId:"old",sessionId:"new-session"})).toMatchObject({success:false});expect(m.settle).not.toHaveBeenCalled();
});
it("does not release a booking when the cancellation deadline fails",async()=>{
 m.settle.mockRejectedValue(new Error("已超過取消截止時間"));
 expect(await rescheduleMemberCourseBooking({bookingId:"old",sessionId:"new-session"})).toMatchObject({success:false});expect(m.reserve).not.toHaveBeenCalled();
});

it.each(["TRIAL", "CARD"])("blocks %s rescheduling before cancelling when student self-booking is off", async bookingKind => {
 m.booking.mockResolvedValue({...original(),bookingKind,...(bookingKind === "CARD" ? {cardId:"card",card:{termSessionIds:[],members:[{customerId:"member"}]}} : {})});
 m.rules.mockResolvedValue({selfBookingEnabled:false});
 expect(await rescheduleMemberCourseBooking({bookingId:"old",sessionId:"new-session"})).toMatchObject({success:false,error:"如需預約或調整時間，請聯繫店家"});
 expect(m.rules).toHaveBeenCalledWith({where:{storeId:"s"}});
 expect(m.target).not.toHaveBeenCalled();expect(m.settle).not.toHaveBeenCalled();expect(m.reserve).not.toHaveBeenCalled();expect(m.payments).not.toHaveBeenCalled();
});
it("keeps trial confirmation available while self-booking is off",async()=>{
 m.rules.mockResolvedValue({selfBookingEnabled:false});
 expect(await confirmMemberCourseTrial("old")).toMatchObject({success:true});
 expect(m.rules).not.toHaveBeenCalled();
});
it("returns an already-committed reschedule receipt after the setting changes", async()=>{
 m.booking.mockResolvedValue({...original(),status:"CANCELLED"});
 m.prior.mockResolvedValue({id:"new",operatorUserId:"u",status:"RESERVED"});
 m.rules.mockResolvedValue({selfBookingEnabled:false});
 expect(await rescheduleMemberCourseBooking({bookingId:"old",sessionId:"new-session"})).toMatchObject({success:true,bookingId:"new"});
 expect(m.rules).not.toHaveBeenCalled();expect(m.settle).not.toHaveBeenCalled();expect(m.reserve).not.toHaveBeenCalled();
});

it("loads existing booking details and cancellation cutoff with no reschedule candidates while disabled", async()=>{
 m.rules.mockResolvedValue({selfBookingEnabled:false,cancellationLeadMinutes:120});
 m.config.mockResolvedValue({bookableUntilDate:new Date("2099-12-31"),bookingWindowDays:14});
 expect(await loadCourseBookingNotification("old")).toMatchObject({success:true,selfBookingEnabled:false,booking:{id:"old",active:true,trial:true},sessions:[]});
 expect(m.sessions).not.toHaveBeenCalled();expect(m.rules).toHaveBeenCalledWith({where:{storeId:"s"}});
 expect(m.booking).toHaveBeenCalledWith(expect.objectContaining({where:{id:"old",storeId:"s"}}));
});
it("loads available rescheduling sessions for legacy enabled stores", async()=>{
 m.rules.mockResolvedValue(null);m.sessions.mockResolvedValue([]);
 m.config.mockResolvedValue({bookableUntilDate:new Date("2099-12-31"),bookingWindowDays:14});
 expect(await loadCourseBookingNotification("old")).toMatchObject({success:true,selfBookingEnabled:true});
 expect(m.sessions).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({storeId:"s",templateId:"t"})}));
});
