import {beforeEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({scope:vi.fn(),sessions:vi.fn(),sessionQuery:vi.fn(),entitlement:vi.fn()}));
vi.mock("@/lib/sports-native-preview",()=>({sportsNativePreview:m.scope}));
vi.mock("@/server/services/course-access",()=>({courseManagerRead:async()=>({storeId:"sports-live-flow-store"})}));
vi.mock("@/lib/feature-gate",()=>({requireStoreFeature:async()=>{}}));
vi.mock("@/lib/db",()=>({prisma:{storeFeatureEntitlement:{findFirst:m.entitlement},businessHours:{findMany:async()=>[]},specialBusinessDay:{findMany:async()=>[]},customer:{findMany:async()=>[{id:"member",assignedStaffId:"coach"}]},$queryRaw:async()=>[]}}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{courseBookingRule:{findUnique:async()=>({selfBookingEnabled:false,assignedSchedulingEnabled:true})},courseSession:{findMany:m.sessions},courseRental:{findMany:async()=>[]},$queryRaw:async()=>[{sessionId:"session",frequency:"BIWEEKLY"}]}}));
import {loadSportsCalendar} from "@/server/actions/sports-calendar";
const session={id:"session",nameSnapshot:"運動",templateId:"template",startsAt:new Date("2026-11-09T01:00:00Z"),endsAt:new Date("2026-11-09T02:00:00Z"),coachId:"coach",roomId:"room",capacity:8,pointCost:2,isTrial:false,requestKey:"key",teacherAttendance:"SCHEDULED",releasedAt:null,rescheduledFromStartsAt:null,rescheduledFromEndsAt:null,rescheduledAt:null,rescheduledFromRoomId:null,rescheduledFromCoachId:null,rescheduleKind:null,bookings:[{id:"booking",customerId:"member",customerName:"驗收",status:"RESERVED",absenceKind:null,bookingKind:"STANDARD",checkedInAt:null,notes:"",cardId:"private-card-id"}]};
beforeEach(()=>{vi.clearAllMocks();m.scope.mockReturnValue(true);m.sessions.mockResolvedValue([session]);m.entitlement.mockResolvedValue({id:"entitlement"});});
it("loads the requested month through store-scoped reads, without leaking unrelated booking fields",async()=>{
 const r=await loadSportsCalendar("2026-11-09");expect(r.success).toBe(true);if(!r.success)return;
 expect(r.data.month).toBe("2026-11");expect(r.data.schedulingModes).toEqual({selfBookingEnabled:false,assignedSchedulingEnabled:true});expect(r.data.sessions[0]).toMatchObject({isFixed:true,isBiweekly:true,bookings:[{assignedCoachId:"coach",status:"RESERVED"}]});expect(JSON.stringify(r.data)).not.toContain("private-card-id");
 expect(m.sessions.mock.calls[0][0].where.storeId).toBe("sports-live-flow-store");expect(Object.keys(r.data.calendarDays)).toContain("2026-11-30");
});
it("rejects unsupported deployment/store scope before reading the calendar",async()=>{m.scope.mockReturnValue(false);expect((await loadSportsCalendar("2026-11-09")).success).toBe(false);expect(m.sessions).not.toHaveBeenCalled();});
it("rejects malformed dates before reading store data",async()=>{expect((await loadSportsCalendar("not-a-date")).success).toBe(false);expect(m.sessions).not.toHaveBeenCalled();});
it.each([false,true])("shows the teaching item for existing classes, trial=%s, without changing individual bookings",async isTrial=>{
 const bookings=[{...session.bookings[0],bookingKind:"TRIAL"},{...session.bookings[0],id:"ten",cardId:"ten-lessons",bookingKind:"CARD"},{...session.bookings[0],id:"twenty",cardId:"twenty-lessons",bookingKind:"CARD"}];
 m.sessions.mockResolvedValue([{...session,isTrial,nameSnapshot:"舞蹈-20堂",template:{musicSubject:{name:"舞蹈（基礎課程）"}},bookings}]);
 const r=await loadSportsCalendar("2026-11-09");expect(r.success).toBe(true);if(!r.success)return;
 expect(r.data.sessions[0]).toMatchObject({nameSnapshot:"舞蹈（基礎課程）",isTrial,bookings:[{bookingKind:"TRIAL"},{bookingKind:"CARD"},{bookingKind:"CARD"}]});
 expect(bookings.map(b=>b.cardId)).toEqual(["private-card-id","ten-lessons","twenty-lessons"]);
 expect(m.sessions.mock.calls[0][0].include.template).toEqual({select:{musicSubject:{select:{name:true}}}});
});
