import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AppError } from "@/lib/app-error";

const mocks = vi.hoisted(() => ({
  permission: vi.fn(), activeStore: vi.fn(), view: vi.fn(), feature: vi.fn(), industry: vi.fn(), scope: vi.fn(), query: vi.fn(), staff: vi.fn(), beautyAccess: vi.fn(), beautyQuery: vi.fn(), beautyPlans: vi.fn(),
}));
vi.mock("@/lib/permissions", () => ({ requirePermission: mocks.permission }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: mocks.activeStore }));
vi.mock("@/lib/store-view-context-server", () => ({
  resolveStoreViewContextFromCookie: mocks.view,
  storeIdForViewContext: (store: string | null, view: { viewedStoreId: string } | null) => view?.viewedStoreId ?? store,
  userForViewContext: (user: unknown) => user,
}));
vi.mock("@/lib/feature-gate", () => ({ requireStoreFeature: mocks.feature }));
vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule: mocks.industry }));
vi.mock("@/lib/manager-visibility", () => ({ getManagerCustomerWhere: mocks.scope }));
vi.mock("@/lib/db", () => ({ prisma: { $queryRaw: mocks.query, staff: { findMany: mocks.staff } } }));
vi.mock("@/lib/beauty-db",()=>({beautyPrisma:{$queryRaw:mocks.beautyQuery,beautyPlan:{findMany:mocks.beautyPlans}}}));
vi.mock("@/server/beauty/access",()=>({requireBeauty:mocks.beautyAccess}));
import { getCustomerConsumption, getCustomerConsumptionAccess } from "@/server/queries/customer-consumption";
import { GET } from "@/app/api/export/customer-consumption-summary/route";

const options = [{ id: "plan", name: "堂數卡", unit: "SESSION" }];
beforeEach(() => {
  vi.resetAllMocks();
  mocks.permission.mockResolvedValue({ role: "STAFF", staffId: "staff", storeId: "own-store" });
  mocks.activeStore.mockResolvedValue("own-store"); mocks.view.mockResolvedValue(null);
  mocks.feature.mockResolvedValue(undefined); mocks.industry.mockResolvedValue("course");
  mocks.scope.mockReturnValue({ assignedStaffId: "staff" });
  mocks.staff.mockResolvedValue([{ id: "staff", displayName: "林店長" }]);
  mocks.query.mockResolvedValueOnce(options).mockResolvedValue([{ total: 0, matched: 0, page: 1, rows: [] }]);
});

describe("consumption read and export authorization", () => {
  it.each(["customer.read", "booking.read", "wallet.read", "transaction.read"])("rejects missing %s before reading customer data", async permission => {
    mocks.permission.mockImplementation(async code => {
      if (code === permission) throw new AppError("FORBIDDEN", "權限不足");
      return { role: "STAFF", staffId: "staff", storeId: "own-store" };
    });
    await expect(getCustomerConsumption({})).rejects.toThrow("權限不足");
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("rejects aggregate HQ mode until a concrete store is selected", async () => {
    mocks.activeStore.mockResolvedValue(null);
    await expect(getCustomerConsumption({})).rejects.toThrow("請先選擇一家店家");
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("resolves authorized viewed store and assignment scope, not a client supplied store", async () => {
    mocks.view.mockResolvedValue({ isViewMode: true, viewedStoreId: "child-store" });
    const access = await getCustomerConsumptionAccess();
    expect(access).toEqual({ storeId: "child-store", module: "course", staffScope: "staff" });
    expect(mocks.feature).toHaveBeenCalledWith("child-store", "customer_care");
  });
  it("rejects disabled customer care entitlement before data reads", async () => {
    mocks.feature.mockRejectedValue(new AppError("FORBIDDEN", "此功能尚未開通"));
    await expect(getCustomerConsumption({})).rejects.toThrow("尚未開通");
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("rejects another store's plan and unused units without running the report", async () => {
    await expect(getCustomerConsumption({ planId: "foreign-plan" })).rejects.toThrow("不屬於目前店家");
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
  it("requires customer.export even for a direct CSV request", async () => {
    mocks.permission.mockImplementation(async code => {
      if (code === "customer.export") throw new AppError("FORBIDDEN", "無匯出權限");
      return { role: "STAFF", staffId: "staff", storeId: "own-store" };
    });
    const response = await GET(new NextRequest("http://localhost/api/export/customer-consumption-summary"));
    expect(response.status).toBe(403); expect(mocks.query).not.toHaveBeenCalled();
  });
  it("rejects a foreign or invisible manager before querying the consumption report", async () => {
    await expect(getCustomerConsumption({ staffId: "foreign-staff" })).rejects.toThrow("所選店長不屬於目前可查看範圍");
    expect(mocks.staff).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "own-store", id: "staff" } }));
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
  it("keeps the selected manager in exported filter context", async () => {
    const response = await GET(new NextRequest("http://localhost/api/export/customer-consumption-summary?staffId=staff"));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"所屬店長條件","林店長"');
  });
  it("requires the viewed store's data-export entitlement", async () => {
    mocks.feature.mockImplementation(async (_store, key) => { if (key === "data_export") throw new AppError("FORBIDDEN", "未開通匯出"); });
    const response = await GET(new NextRequest("http://localhost/api/export/customer-consumption-summary"));
    expect(response.status).toBe(403); expect(mocks.query).not.toHaveBeenCalled();
  });
  it("does not silently truncate a CSV beyond the export limit", async () => {
    mocks.query.mockReset().mockResolvedValueOnce(options).mockResolvedValueOnce([{ total: 10001, matched: 10001, page: 1, rows: [] }]);
    const response = await GET(new NextRequest("http://localhost/api/export/customer-consumption-summary"));
    expect(response.status).toBe(400); expect(await response.text()).toContain("縮小篩選條件");
  });
  it("exports with no-store headers and the same resolved conditions", async () => {
    const response = await GET(new NextRequest("http://localhost/api/export/customer-consumption-summary?preset=custom&startDate=2026-10-01&endDate=2026-10-20&direction=asc&top=5"));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toContain("2026-10-01-2026-10-20.csv");
    expect(await response.text()).toContain('"由少到多","前 5 名"');
  });
});


describe("Beauty dedicated consumption port",()=>{
 beforeEach(()=>{mocks.industry.mockResolvedValue("beauty");mocks.query.mockReset().mockResolvedValue([{id:"c",name:"顧客",phone:"0900",assignedStaffName:null}]);mocks.beautyPlans.mockResolvedValue([{id:"beauty-plan",name:"十次方案"}]);mocks.beautyQuery.mockResolvedValue([{total:1,matched:1,page:1,rows:[]}]);});
 it("reads scoped core identities before using only the Beauty data connection",async()=>{const data=await getCustomerConsumption({planId:"beauty-plan"});expect(data.module).toBe("beauty");expect(data.metrics).toEqual(["count","amount","paid"]);expect(mocks.beautyAccess).toHaveBeenCalledWith("own-store");expect(mocks.beautyPlans).toHaveBeenCalledWith(expect.objectContaining({where:{storeId:"own-store"}}));expect(mocks.query).toHaveBeenCalledTimes(1);const sql=mocks.beautyQuery.mock.calls[0][0];expect(sql.text).toContain('"BeautyLedger"');expect(sql.text).not.toMatch(/FROM "(?:User|Staff|CourseBooking)"/);expect(sql.values).toContain("own-store");});
 it("rejects a closed Beauty gate before either database data read",async()=>{mocks.beautyAccess.mockRejectedValue(new AppError("FORBIDDEN","美業尚未開放"));await expect(getCustomerConsumption({})).rejects.toThrow("尚未開放");expect(mocks.query).not.toHaveBeenCalled();expect(mocks.beautyQuery).not.toHaveBeenCalled();});
 it("rejects foreign plans before core customer query or Beauty report",async()=>{await expect(getCustomerConsumption({planId:"foreign"})).rejects.toThrow("不屬於目前店家");expect(mocks.query).not.toHaveBeenCalled();expect(mocks.beautyQuery).not.toHaveBeenCalled();});
 it("exports Beauty labels with existing permissions and no-store",async()=>{const response=await GET(new NextRequest("http://localhost/api/export/customer-consumption-summary"));expect(response.status).toBe(200);expect(await response.text()).toContain('"取消／未到扣次"');expect(mocks.permission).toHaveBeenCalledWith("customer.export");});
});

describe("Music uses the shared COURSE consumption route",()=>{
 it("accepts music lesson/session plans without routing to Steamfoot or Beauty",async()=>{mocks.industry.mockResolvedValue("course");mocks.query.mockReset().mockResolvedValueOnce([{id:"piano",name:"鋼琴個別課 4 堂",unit:"SESSION"}]).mockResolvedValueOnce([{total:1,matched:1,page:1,rows:[]}]);const data=await getCustomerConsumption({planId:"piano"});expect(data.metrics).toEqual(["count","sessions","amount","paid"]);expect(mocks.query.mock.calls[1][0].text).toContain('"CourseBooking"');expect(mocks.beautyQuery).not.toHaveBeenCalled();});
});
