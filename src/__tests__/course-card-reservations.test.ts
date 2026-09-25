import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({manager:vi.fn(),people:vi.fn(),card:vi.fn(),bookings:vi.fn(),visibility:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager}));
vi.mock("@/lib/db",()=>({prisma:{customer:{findMany:m.people}}}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{coursePointCard:{findFirst:m.card},courseBooking:{findMany:m.bookings}}}));
vi.mock("@/lib/manager-visibility",()=>({getManagerCustomerWhere:m.visibility}));
vi.mock("@/lib/errors",()=>({AppError:class extends Error{constructor(_code:string,message:string){super(message);}},handleActionError:(e:Error)=>({success:false,error:e.message})}));
import {loadCourseCardReservations} from "@/server/actions/course-card-reservations";
beforeEach(()=>{vi.resetAllMocks();m.manager.mockResolvedValue({storeId:"store-a",user:{role:"OWNER",staffId:"manager-a"}});m.visibility.mockReturnValue({});m.card.mockResolvedValue({id:"card-a"});m.bookings.mockResolvedValue([]);});
it("requires booking, wallet and customer permissions before loading",async()=>{
 m.manager.mockRejectedValue(new Error("denied"));expect((await loadCourseCardReservations({cardId:"card-a"})).success).toBe(false);expect(m.card).not.toHaveBeenCalled();expect(m.bookings).not.toHaveBeenCalled();
});
it("does not read bookings for another store or invisible card",async()=>{
 m.card.mockResolvedValue(null);expect((await loadCourseCardReservations({cardId:"foreign"})).success).toBe(false);expect(m.card).toHaveBeenCalledWith(expect.objectContaining({where:{id:"foreign",storeId:"store-a"}}));expect(m.bookings).not.toHaveBeenCalled();
});
it("limits shared-card details to visible learners",async()=>{
 m.visibility.mockReturnValue({assignedStaffId:"manager-a"});m.people.mockResolvedValue([{id:"learner-a"}]);
 const r=await loadCourseCardReservations({cardId:"card-a"});expect(r.success&&r.scoped).toBe(true);
 expect(m.manager.mock.calls.map(c=>c[0])).toEqual(["booking.read","wallet.read","customer.read"]);
 expect(m.card).toHaveBeenCalledWith(expect.objectContaining({where:{id:"card-a",storeId:"store-a",members:{some:{storeId:"store-a",customerId:{in:["learner-a"]}}}}}));
 expect(m.bookings).toHaveBeenCalledWith(expect.objectContaining({where:{storeId:"store-a",cardId:"card-a",status:"RESERVED",customerId:{in:["learner-a"]}}}));
});
it("paginates reserved lessons with learner and exact quota",async()=>{
 m.bookings.mockResolvedValue(Array.from({length:21},(_,i)=>({id:String(i),customerName:"學員",pointCost:3,session:{nameSnapshot:"運動",startsAt:new Date("2026-10-01T00:00:00Z")}})));
 const r=await loadCourseCardReservations({cardId:"card-a",page:1});expect(r.success&&r.rows).toHaveLength(20);expect(r.success&&r.hasMore).toBe(true);expect(r.success&&r.rows[0]).toMatchObject({amount:3,name:"運動",customerName:"學員"});expect(m.bookings).toHaveBeenCalledWith(expect.objectContaining({skip:20,take:21}));
});
