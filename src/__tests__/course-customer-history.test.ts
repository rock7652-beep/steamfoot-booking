import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ manager: vi.fn(), customer: vi.fn(), orders: vi.fn() }));
vi.mock("@/server/services/course-access", () => ({ courseManager: mocks.manager }));
vi.mock("@/lib/db", () => ({ prisma: { customer: { findFirst: mocks.customer } } }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { coursePurchase: { findMany: mocks.orders } } }));
import { loadCourseCustomerPurchases } from "@/server/actions/course-customer-history";
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
      where: { storeId: "course-store", customerId: "customer" },
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
