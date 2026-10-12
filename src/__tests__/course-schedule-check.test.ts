import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({access:vi.fn(),resources:vi.fn(),hours:vi.fn(),availability:vi.fn(),duty:vi.fn(),sessions:vi.fn(),bookings:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.access}));
vi.mock("@/server/services/course-resources",()=>({assertCourseResources:m.resources,handleCourseActionError:(e:Error)=>({success:false,error:e.message})}));
vi.mock("@/server/services/course-business-hours",()=>({assertCourseSessionsFitHours:m.hours}));
vi.mock("@/server/services/course-availability",()=>({assertMusicCourseAvailability:m.availability}));
vi.mock("@/server/services/course-duty",()=>({assertCourseDutyCoverage:m.duty}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{courseSession:{findMany:m.sessions},courseBooking:{findMany:m.bookings}}}));
import {inspectCourseSchedule} from "@/server/actions/course-schedule-check";
const input={templateId:"guitar",roomId:"room",coachId:"teacher",capacity:2,date:"2099-10-01",time:"18:00",durationMinutes:60,additionalDates:["2099-10-08"],learners:[{customerId:"a",cardId:"card"}],requestKey:"00000000-0000-4000-8000-000000000017"};
beforeEach(()=>{vi.resetAllMocks();m.access.mockResolvedValue({storeId:"store"});m.sessions.mockResolvedValue([]);m.bookings.mockResolvedValue([]);});
it("reports room, student and availability conflicts across the entire batch without writing",async()=>{
  m.sessions.mockResolvedValue([{startsAt:new Date("2099-10-01T10:00:00Z"),endsAt:new Date("2099-10-01T11:00:00Z"),roomId:"room"}]);
  m.bookings.mockResolvedValue([{customerId:"a",customerName:"小安",session:{startsAt:new Date("2099-10-08T10:00:00Z"),endsAt:new Date("2099-10-08T11:00:00Z")}}]);
  m.availability.mockImplementation(async(_tx,_store,_teacher,[range])=>{if(range.startsAt.getUTCDate()===8)throw new Error("老師未排班");});
  expect(await inspectCourseSchedule(input)).toMatchObject({success:true,issues:[{date:"2099-10-01",reason:"18:00 教室已有課"},{date:"2099-10-08",reason:"小安同時段已有課"},{date:"2099-10-08",reason:"老師未排班"}]});
  expect(m.sessions.mock.calls[0][0].where.storeId).toBe("store");
  expect(m.bookings.mock.calls[0][0].where.customerId).toEqual({in:["a"]});
});
it("rejects an unauthorized check before reading schedules",async()=>{
  m.access.mockRejectedValue(new Error("沒有排課權限"));
  expect(await inspectCourseSchedule(input)).toMatchObject({success:false,error:"沒有排課權限"});
  expect(m.sessions).not.toHaveBeenCalled();
});
it("checks only the dates explicitly included in the request",async()=>{
  await inspectCourseSchedule({...input,additionalDates:[]});
  expect(m.hours).toHaveBeenCalledTimes(1);
  expect(m.availability).toHaveBeenCalledTimes(1);
});
