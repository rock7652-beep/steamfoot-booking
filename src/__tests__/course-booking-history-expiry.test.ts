vi.mock("@/lib/auth",()=>({auth:vi.fn()}));
import {expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({manager:vi.fn(),customer:vi.fn(),bookings:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager}));
vi.mock("@/lib/db",()=>({prisma:{customer:{findFirst:m.customer}}}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{courseBooking:{findMany:m.bookings}}}));
import {loadCourseCustomerBookings} from "@/server/actions/course-members";
it("distinguishes unactivated native cards from activated and imported expiry dates",async()=>{
 m.manager.mockResolvedValue({storeId:"store"});m.customer.mockResolvedValue({id:"student"});
 const expiresAt=new Date("2027-02-25T00:00:00Z");
 m.bookings.mockResolvedValue([
  {musicActivatedAt:null,musicOpeningStateRequired:false},
  {musicActivatedAt:new Date(),musicOpeningStateRequired:false},
  {musicActivatedAt:null,musicOpeningStateRequired:true},
 ].map((state,i)=>({id:String(i),session:{startsAt:new Date(),nameSnapshot:"吉他"},card:{...state,requestKey:"native-test",expiresAt,musicValidityDays:35,nameSnapshot:"四堂",unit:"SESSION"}})));
 const result=await loadCourseCustomerBookings("student");
 expect(result.success).toBe(true);
 if(result.success){expect(result.data.map(row=>row.validityDays)).toEqual([35,null,null]);expect(result.data.map(row=>row.expiresAt)).toEqual(Array(3).fill(expiresAt.toISOString()));}
 expect(m.manager.mock.calls.map(call=>call[0])).toEqual(["customer.read","booking.read"]);
});
