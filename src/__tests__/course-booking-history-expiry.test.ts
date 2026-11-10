vi.mock("@/lib/auth",()=>({auth:vi.fn()}));
import {expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({manager:vi.fn(),customer:vi.fn(),bookings:vi.fn(),card:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager}));
vi.mock("@/lib/db",()=>({prisma:{customer:{findFirst:m.customer}}}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{courseBooking:{findMany:m.bookings},coursePointCard:{findFirst:m.card}}}));
import {loadCourseCustomerBookings} from "@/server/actions/course-members";
it("distinguishes unactivated native cards from activated and imported expiry dates",async()=>{
 m.manager.mockResolvedValue({storeId:"store",user:{role:"OWNER",staffId:null}});m.customer.mockResolvedValue({id:"student"});
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

it('以實際卡片隔離同名方案的上課紀錄，分頁與日期條件在資料庫先篩選',async()=>{
 vi.clearAllMocks();m.manager.mockResolvedValue({storeId:'store',user:{role:'OWNER',staffId:null}});m.customer.mockResolvedValue({id:'student'});m.card.mockResolvedValue({id:'card-1'});m.bookings.mockResolvedValue([]);
 expect(await loadCourseCustomerBookings('student',10,{cardId:'card-1',from:'2026-10-01',to:'2026-11-10'})).toMatchObject({success:true});
 expect(m.card).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:'card-1',storeId:'store'})}));
 expect(m.bookings).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({storeId:'store',customerId:'student',cardId:'card-1',session:expect.anything()}),skip:10,take:11}));
 expect(m.manager).toHaveBeenCalledWith('wallet.read');
});
it.each(['foreign','missing'])('拒絕不是此學員的方案 %s，不洩漏紀錄',async cardId=>{
 vi.clearAllMocks();m.manager.mockResolvedValue({storeId:'store',user:{role:'OWNER',staffId:null}});m.customer.mockResolvedValue({id:'student'});m.card.mockResolvedValue(null);
 expect(await loadCourseCustomerBookings('student',0,{cardId})).toMatchObject({success:false});expect(m.bookings).not.toHaveBeenCalled();
});
