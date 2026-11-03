import {expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({access:vi.fn().mockResolvedValue({storeId:"store",user:{role:"STAFF",staffId:"staff"}}),customers:vi.fn(),cards:vi.fn(),templates:vi.fn().mockResolvedValue([{id:"guitar-plan"}]),periods:vi.fn().mockReturnValue(false),starts:vi.fn().mockResolvedValue([])}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.access}));
vi.mock("@/server/queries/course-members",()=>({getCourseCards:m.cards}));
vi.mock("@/lib/db",()=>({prisma:{customer:{findMany:m.customers}}}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{courseTemplate:{findMany:m.templates},coursePointCard:{findMany:m.starts}}}));
vi.mock("@/server/services/music-teaching-item",()=>({readTeachingTrialPrice:vi.fn()}));
vi.mock("@/lib/shop-config",()=>({getTrialSettings:vi.fn().mockResolvedValue({trialEnabled:false})}));
vi.mock("@/lib/manager-visibility",()=>({getManagerCustomerWhere:()=>({assignedStaffId:"staff"})}));
vi.mock("@/lib/feature-gate",()=>({getStoreLimitsByStoreId:vi.fn()}));
vi.mock("@/server/services/music-lesson-periods",()=>({fixedMusicPeriodsEnabled:m.periods}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
import {loadCourseScheduleEnrollmentOptions} from "@/server/actions/course-schedule-enrollment";
it("returns reasons for expired/mismatched cards while preserving visible-member and store scope",async()=>{
 m.customers.mockResolvedValue([{id:"a",name:"學員",phone:""}]);
 const base={unit:"SESSION",available:0,remaining:0,held:0,members:[{id:"a",name:"學員",phone:""},{id:"hidden",name:"不可見",phone:"secret"}],expiresAt:"2020-01-01T00:00:00Z"};
 m.cards.mockResolvedValue([{...base,id:"expired",name:"舊卡",expired:true,templateIds:["guitar-plan"]},{...base,id:"wrong",name:"別科",expired:false,templateIds:["piano-plan"]},{...base,id:"hidden-card",name:"隱藏",templateIds:[],members:[{id:"hidden",name:"不可見",phone:"secret"}]}]);
 const result=await loadCourseScheduleEnrollmentOptions("teaching:guitar");expect(result.success).toBe(true);if(!result.success)return;
 expect(result.cards.map(c=>[c.id,c.subjectMatches,c.expired])).toEqual([["expired",true,true],["wrong",false,false]]);
 expect(result.cards.every(c=>c.members.every(member=>member.id==="a"))).toBe(true);
 expect(m.access).toHaveBeenCalledWith("booking.create");expect(m.access).toHaveBeenCalledWith("customer.read");
 expect(m.cards).toHaveBeenCalledWith("store",undefined,expect.objectContaining({where:{closedAt:null,members:{some:{customerId:{in:["a"]}}}}}));
});

it("marks missing music period snapshots unavailable only in the fixed-period workflow",async()=>{
 m.customers.mockResolvedValue([{id:"a",name:"學員",phone:""}]);
 m.cards.mockResolvedValue([{id:"card",name:"4堂",unit:"SESSION",available:4,remaining:4,held:0,members:[{id:"a",name:"學員",phone:""}],expiresAt:"2099-12-31T00:00:00Z",templateIds:["guitar-plan"]}]);
 m.starts.mockResolvedValue([{id:"card",musicJoinSessionId:null,musicTermSizes:[],musicOpeningStateRequired:false,bookings:[]}]);
 m.periods.mockReturnValue(true);
 const blocked=await loadCourseScheduleEnrollmentOptions("teaching:guitar");
 expect(blocked.success&&blocked.cards[0].unavailableReason).toBe("方案期別待確認，請先核對各期堂數");
 m.starts.mockResolvedValue([{id:"card",musicJoinSessionId:null,musicTermSizes:[4],musicOpeningStateRequired:false,bookings:[]}]);
 const valid=await loadCourseScheduleEnrollmentOptions("teaching:guitar");
 expect(valid.success&&valid.cards[0].unavailableReason).toBeNull();
 m.starts.mockResolvedValue([{id:"card",musicJoinSessionId:null,musicTermSizes:[],musicOpeningStateRequired:false,bookings:[]}]);
 m.periods.mockReturnValue(false);
 const other=await loadCourseScheduleEnrollmentOptions("teaching:guitar");
 expect(other.success&&other.cards[0].unavailableReason).toBeNull();
});
