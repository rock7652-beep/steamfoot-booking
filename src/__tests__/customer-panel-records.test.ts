import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({permission:vi.fn(),customer:vi.fn(),booking:vi.fn(),transaction:vi.fn(),cashbook:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{customer:{findFirst:m.customer},booking:{findMany:m.booking},transaction:{findMany:m.transaction},cashbookEntry:{findMany:m.cashbook}}}));
vi.mock("@/lib/permissions",()=>({requirePermission:m.permission}));
vi.mock("@/lib/store",()=>({getActiveStoreForRead:async()=>"store-a"}));
vi.mock("@/lib/manager-visibility",()=>({getStoreFilter:()=>({storeId:"store-a"})}));
vi.mock("@/lib/store-view-context-server",()=>({resolveStoreViewContextFromCookie:async()=>null,storeIdForViewContext:(id:string)=>id,userForViewContext:(user:unknown)=>user}));
import {getCustomerPanelRecords} from "@/server/actions/customer-panel-records";
beforeEach(()=>{vi.clearAllMocks();m.permission.mockResolvedValue({role:"OWNER",staffId:"staff-a"});m.customer.mockResolvedValue({id:"customer-a",storeId:"store-a",user:null});});
it("rejects the wrong store without reading booking or consumption data",async()=>{
 m.customer.mockResolvedValue(null);expect((await getCustomerPanelRecords("customer-b","consumption")).success).toBe(false);
 expect(m.customer).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:"customer-b",storeId:"store-a",mergedIntoCustomerId:null})}));expect(m.transaction).not.toHaveBeenCalled();
});
it("requires transaction read even when customer read is allowed",async()=>{
 m.permission.mockImplementation(async(code:string)=>{if(code==="transaction.read")throw new Error("permission denied");return{role:"STAFF"};});
 expect((await getCustomerPanelRecords("customer-a","consumption")).success).toBe(false);expect(m.transaction).not.toHaveBeenCalled();
});
it("paginates the merged transaction and retail stream without dropping either source",async()=>{
 const tx=Array.from({length:21},(_,i)=>({id:`t${i}`,createdAt:new Date(Date.UTC(2026,9,30-i,12)),transactionType:"PACKAGE_PURCHASE",planNameSnapshot:"方案",paymentStatus:"CONFIRMED",amount:100,paymentMethod:"CASH",note:null}));
 const cash=Array.from({length:21},(_,i)=>({id:`c${i}`,entryDate:new Date(Date.UTC(2026,9,30-i)),category:"零售-商品",amount:50,paymentMethod:"CASH",note:null}));
 m.transaction.mockResolvedValue(tx);m.cashbook.mockResolvedValue(cash);
 const first=await getCustomerPanelRecords("customer-a","consumption",1),second=await getCustomerPanelRecords("customer-a","consumption",2);
 expect(first.success&&first.data.rows).toHaveLength(20);expect(second.success&&second.data.rows).toHaveLength(20);
 if(first.success&&second.success){expect(new Set([...first.data.rows,...second.data.rows].map(r=>r.id)).size).toBe(40);expect(first.data.rows[0].id).toBe("transaction:t0");expect(first.data.rows[1].id).toBe("cashbook:c0");}
});
it("keeps booking page queries bounded and scoped",async()=>{
 m.booking.mockResolvedValue([]);const result=await getCustomerPanelRecords("customer-a","bookings",3);expect(result.success).toBe(true);
 expect(m.booking).toHaveBeenCalledWith(expect.objectContaining({where:{customerId:"customer-a",storeId:"store-a"},skip:40,take:21}));expect(m.transaction).not.toHaveBeenCalled();
});

it("filters past bookings before pagination while retaining store scope",async()=>{
 m.booking.mockResolvedValue([]);
 expect((await getCustomerPanelRecords("customer-a","bookings",2,"past")).success).toBe(true);
 expect(m.booking).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({customerId:"customer-a",storeId:"store-a",OR:expect.arrayContaining([expect.objectContaining({bookingDate:expect.objectContaining({lt:expect.any(Date)})}),expect.objectContaining({slotTime:expect.objectContaining({lt:expect.any(String)})})])}),skip:20,take:21}));
});

it("applies item and business-date filters before database pagination",async()=>{
 m.booking.mockResolvedValue([]);m.transaction.mockResolvedValue([]);m.cashbook.mockResolvedValue([]);
 expect((await getCustomerPanelRecords("customer-a","bookings",2,"all",{from:"2026-11-01",to:"2026-11-02",item:"十堂"})).success).toBe(true);
 expect(m.booking.mock.calls[0][0]).toMatchObject({skip:20,take:21,where:{storeId:"store-a",customerId:"customer-a",bookingDate:{gte:new Date("2026-11-01T00:00:00Z"),lte:new Date("2026-11-02T00:00:00Z")},customerPlanWallet:{plan:{name:{contains:"十堂"}}}}});
 expect((await getCustomerPanelRecords("customer-a","consumption",1,"all",{from:"2026-11-01",to:"2026-11-02",item:"十堂"})).success).toBe(true);
 expect(m.transaction.mock.calls[0][0].where).toMatchObject({planNameSnapshot:{contains:"十堂"},createdAt:{gte:new Date("2026-10-31T16:00:00Z"),lte:new Date("2026-11-02T15:59:59.999Z")}});
 expect(m.cashbook.mock.calls[0][0].where).toMatchObject({category:{contains:"十堂"},entryDate:{gte:new Date("2026-11-01T00:00:00Z"),lte:new Date("2026-11-02T00:00:00Z")}});
});
it("rejects inverted dates before reading record sources",async()=>{
 expect((await getCustomerPanelRecords("customer-a","bookings",1,"all",{from:"2026-11-03",to:"2026-11-01"})).success).toBe(false);expect(m.booking).not.toHaveBeenCalled();
});
