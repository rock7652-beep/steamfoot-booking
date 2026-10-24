import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({auth:vi.fn(),scope:vi.fn(),customer:vi.fn(),orders:vi.fn(),tuition:vi.fn(),receipts:vi.fn(),permission:vi.fn(),cards:vi.fn(),lessons:vi.fn(),teachers:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseManagerRead:m.auth}));
vi.mock("@/server/services/music-native-workflow",()=>({musicNativeWorkflowEnabled:m.scope}));
vi.mock("@/lib/db",()=>({prisma:{customer:{findFirst:m.customer},staff:{findMany:m.teachers}}}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{coursePurchase:{findMany:m.orders},coursePointCard:{findMany:m.cards},courseBooking:{findMany:m.lessons}}}));
vi.mock("@/server/services/music-tuition",()=>({readMusicTuition:m.tuition,readMusicReceipts:m.receipts}));
vi.mock("@/lib/permissions",()=>({checkPermission:m.permission}));
import {readCourseCustomerPurchases} from "@/server/queries/course-customer-purchases";
const order={id:"purchase",cardId:"card",name:"plan",price:1000,points:4,unit:"SESSION",status:"CONFIRMED",createdAt:new Date("2026-10-16T00:00:00Z"),confirmedAt:null,refunds:[],discountValue:null,musicTermSizes:[4]};
beforeEach(()=>{
 vi.clearAllMocks();m.auth.mockResolvedValue({storeId:"store",user:{id:"user",role:"ADMIN",staffId:null}});m.scope.mockReturnValue(true);m.customer.mockResolvedValue({id:"student"});m.orders.mockResolvedValue([order]);m.tuition.mockResolvedValue(new Map([["purchase",{due:3200,discountTeacherFee:false}]]));m.receipts.mockResolvedValue([{id:"r",purchaseId:"purchase",amount:1000,method:"OTHER",lastFour:null,paidAt:new Date("2026-10-16T00:00:00Z")}]);m.permission.mockResolvedValue(true);m.cards.mockResolvedValue([{id:"card",musicValidityDays:35,musicActivatedAt:null,expiresAt:null}]);m.lessons.mockResolvedValue([]);m.teachers.mockResolvedValue([]);
});
it("keeps both permissions and returns authoritative payments, balance and expiry",async()=>{
 const timings={};const result=await readCourseCustomerPurchases("student",0,{},true,timings);
 expect(m.auth).toHaveBeenCalledWith("customer.read",{reuseVerifiedStore:true});expect(m.auth).toHaveBeenCalledWith("transaction.read",{reuseVerifiedStore:true});
 expect(result.success).toBe(true);if(result.success){expect(result.data[0].price).toBe(1000);expect(result.data[0].tuition).toMatchObject({due:3200,expiry:"首次扣堂起 35 天",canReceive:true,receipts:[{id:"r",amount:1000}]});}
 expect(Object.keys(timings)).toEqual(["authorization","customer","orders","metadata","lessons"]);
});
it("starts cards and capabilities while tuition metadata is pending",async()=>{
 let release!:(v:Map<string,{due:number;discountTeacherFee:boolean}>)=>void;let started!:()=>void;const entered=new Promise<void>(r=>started=r);
 m.tuition.mockImplementation(()=>{started();return new Promise(r=>release=r);});
 const result=readCourseCustomerPurchases("student",0,{},true);await entered;
 expect(m.cards).toHaveBeenCalledOnce();expect(m.permission).toHaveBeenCalledTimes(2);expect(m.receipts).toHaveBeenCalledOnce();expect(m.lessons).not.toHaveBeenCalled();
 release(new Map([["purchase",{due:3200,discountTeacherFee:false}]]));await result;
});
it("never reads lessons without booking permission",async()=>{
 m.permission.mockImplementation(async()=>false);
 const r=await readCourseCustomerPurchases("student",0,{},true);expect(m.lessons).not.toHaveBeenCalled();expect(m.teachers).not.toHaveBeenCalled();if(r.success)expect(r.data[0].tuition).toMatchObject({canReceive:false,canReadBookings:false,lessons:[]});
});
it.each(["permission","store","actor","preview","customer"])("rejects %s mismatch before financial queries",async kind=>{
 if(kind==="permission")m.auth.mockRejectedValueOnce(new Error("denied"));
 if(kind==="store")m.auth.mockResolvedValueOnce({storeId:"other",user:{id:"user"}});
 if(kind==="actor")m.auth.mockResolvedValueOnce({storeId:"store",user:{id:"other"}});
 if(kind==="preview")m.scope.mockReturnValue(false);
 if(kind==="customer")m.customer.mockResolvedValue(null);
 expect((await readCourseCustomerPurchases("student",0,{},true)).success).toBe(false);expect(m.orders).not.toHaveBeenCalled();expect(m.receipts).not.toHaveBeenCalled();
});
it("leaves non-preview authorization on the original store resolver",async()=>{
 await readCourseCustomerPurchases("student");expect(m.auth).toHaveBeenCalledWith("customer.read",{reuseVerifiedStore:false});expect(m.auth).toHaveBeenCalledWith("transaction.read",{reuseVerifiedStore:false});
});
