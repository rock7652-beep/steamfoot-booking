import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ manager: vi.fn(), customer: vi.fn(), orders: vi.fn(), income: vi.fn() }));
vi.mock("@/server/services/course-access", () => ({ courseManager: mocks.manager }));
vi.mock("@/lib/db", () => ({ prisma: { cashbookEntry: { findMany: mocks.income }, customer: { findFirst: mocks.customer } } }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { coursePurchase: { findMany: mocks.orders } } }));
import { loadCourseCustomerPurchases, loadCourseCustomerIncome } from "@/server/actions/course-customer-history";
import { AppError } from "@/lib/errors";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.manager.mockResolvedValue({ storeId: "course-store" });
  mocks.customer.mockResolvedValue({ id: "customer" });
  mocks.orders.mockResolvedValue([]);
});
describe("course customer purchase history", () => {
  it("requires customer and transaction permissions and scopes customer, orders and refunds", async () => {
    expect(await loadCourseCustomerPurchases("customer")).toEqual({ success: true, hasMore: false, data: [] });
    expect(mocks.manager.mock.calls.map(call => call[0])).toEqual(["customer.read", "transaction.read"]);
    expect(mocks.customer).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "customer", storeId: "course-store", mergedIntoCustomerId: null } }));
    expect(mocks.orders).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: "course-store", customerId: "customer", createdAt: {} },
      select: expect.objectContaining({ refunds: expect.objectContaining({ where: { storeId: "course-store" } }) }),
    }));
  });
  it("rejects another store's customer before reading financial history", async () => {
    mocks.customer.mockResolvedValue(null);
    expect(await loadCourseCustomerPurchases("foreign-customer")).toMatchObject({ success: false });
    expect(mocks.orders).not.toHaveBeenCalled();
  });
  it("does not disclose orders without transaction permission", async () => {
    mocks.manager.mockResolvedValueOnce({ storeId: "course-store" }).mockRejectedValueOnce(new AppError("FORBIDDEN", "無權限"));
    expect(await loadCourseCustomerPurchases("customer")).toMatchObject({ success: false });
    expect(mocks.orders).not.toHaveBeenCalled();
    expect(mocks.customer).not.toHaveBeenCalled();
  });
  it("returns historical paid snapshots and recorded refunds without a new refund calculation", async () => {
    const date = new Date("2026-09-17T01:00:00Z");
    mocks.orders.mockResolvedValue([{ id: "order", price: 800, status: "REFUNDED", createdAt: date, confirmedAt: date,
      refunds: [{ id: "refund", amount: 800, reason: "未使用全額退", createdAt: date }],
    }]);
    expect(await loadCourseCustomerPurchases("customer")).toMatchObject({ success: true, data: [{
      price: 800, status: "REFUNDED", createdAt: date.toISOString(), refunds: [{ amount: 800, createdAt: date.toISOString() }],
    }] });
  });
});

it("loads ten rows at a time and signals more without dropping remaining history",async()=>{const date=new Date();mocks.orders.mockResolvedValue(Array.from({length:11},(_,i)=>({id:String(i),createdAt:date,confirmedAt:null,refunds:[]})));const r=await loadCourseCustomerPurchases("customer",10);expect(r).toMatchObject({success:true,hasMore:true});if(r.success)expect(r.data).toHaveLength(10);expect(mocks.orders).toHaveBeenCalledWith(expect.objectContaining({skip:10,take:11}));});

it("applies Taiwan date boundaries and keeps ten-row database pagination",async()=>{
 await loadCourseCustomerPurchases("customer",20,{from:"2026-09-21",to:"2026-09-21"});
 expect(mocks.orders).toHaveBeenCalledWith(expect.objectContaining({skip:20,take:11,where:expect.objectContaining({createdAt:{gte:new Date("2026-09-20T16:00:00.000Z"),lte:new Date("2026-09-21T15:59:59.999Z")}})}));
});

it("loads linked income by accounting date, amount and customer without mixing stores",async()=>{
 mocks.income.mockResolvedValue([{id:"cash",entryDate:new Date("2026-09-23T00:00:00Z"),category:"其他收入",note:"三寶",amount:100,paymentMethod:"CASH"}]);
 expect(await loadCourseCustomerIncome("customer",0,{from:"2026-09-23",to:"2026-09-23"})).toMatchObject({success:true,data:[{id:"cash",name:"三寶",amount:100,kind:"其他收入",date:"2026-09-23"}]});
 expect(mocks.income).toHaveBeenCalledWith(expect.objectContaining({where:{storeId:"course-store",customerId:"customer",type:"INCOME",NOT:{id:{startsWith:"course-"}},entryDate:{gte:new Date("2026-09-23T00:00:00Z"),lte:new Date("2026-09-23T00:00:00Z")}},skip:0,take:11}));
});
it("rejects income access without financial permission or for a foreign customer",async()=>{
 mocks.manager.mockResolvedValueOnce({storeId:"course-store"}).mockRejectedValueOnce(new AppError("FORBIDDEN","無權限"));
 expect(await loadCourseCustomerIncome("customer")).toMatchObject({success:false});
 expect(mocks.income).not.toHaveBeenCalled();
 mocks.manager.mockResolvedValue({storeId:"course-store"});mocks.customer.mockResolvedValue(null);
 expect(await loadCourseCustomerIncome("foreign")).toMatchObject({success:false});
 expect(mocks.income).not.toHaveBeenCalled();
});
