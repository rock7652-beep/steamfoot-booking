import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mock = vi.hoisted(() => ({ user: vi.fn(), permission: vi.fn(), feature: vi.fn(), active: vi.fn(), context: vi.fn(), customers: vi.fn(), bookings: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: mock.user }));
vi.mock("@/lib/permissions", () => ({ checkPermission: mock.permission }));
vi.mock("@/lib/feature-gate", () => ({ hasStoreFeature: mock.feature }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: mock.active }));
vi.mock("@/lib/store-view-context-server", () => ({ resolveStoreViewContextFromCookie: mock.context, storeIdForViewContext: (active: string, context: { viewedStoreId?: string } | null) => context?.viewedStoreId ?? active }));
vi.mock("@/server/queries/analysis-period", () => ({ getAnalysisPeriodCustomers: mock.customers }));
vi.mock("@/lib/db", () => ({ prisma: { booking: { findMany: mock.bookings } } }));
import { GET } from "@/app/api/reports/analysis-details/route";
function req(query = "segment=monthly-converted&startDate=2026-08-29&endDate=2026-09-04") { return new NextRequest(`http://localhost/api/reports/analysis-details?${query}`); }
beforeEach(() => { vi.clearAllMocks(); mock.user.mockResolvedValue({ role: "OWNER", staffId: "staff", storeId: "own" }); mock.permission.mockResolvedValue(true); mock.feature.mockResolvedValue(true); mock.active.mockResolvedValue("own"); mock.context.mockResolvedValue(null); mock.customers.mockResolvedValue([]); mock.bookings.mockResolvedValue([]); });
describe("analysis detail authorization and period", () => {
  it("requires login before reading data", async () => { mock.user.mockResolvedValue(null); expect((await GET(req())).status).toBe(401); expect(mock.customers).not.toHaveBeenCalled(); });
  it("requires both report and customer permission", async () => { mock.permission.mockImplementation(async (_r, _s, permission) => permission !== "customer.read"); expect((await GET(req())).status).toBe(403); expect(mock.customers).not.toHaveBeenCalled(); });
  it("respects disabled feature", async () => { mock.feature.mockResolvedValue(false); expect((await GET(req())).status).toBe(403); expect(mock.customers).not.toHaveBeenCalled(); });
  it("rejects invalid dates", async () => { expect((await GET(req("segment=monthly-converted&startDate=2026-02-30&endDate=2026-03-01"))).status).toBe(400); });
  it("takes store from authorized context, not a supplied store id", async () => {
    mock.context.mockResolvedValue({ viewedStoreId: "authorized-view" });
    const response = await GET(req("segment=monthly-converted&startDate=2026-08-29&endDate=2026-09-04&storeId=foreign"));
    expect(response.status).toBe(200);
    expect(mock.customers).toHaveBeenCalledWith("authorized-view", expect.objectContaining({ startDate: "2026-08-29", endDate: "2026-09-04" }), "custom", "monthly-converted");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("sums attendance and retains group count in service details", async () => {
    const row = { id: "b", bookingDate: new Date("2026-09-01T00:00:00Z"), people: 3, attendedPeople: 2, customer: { name: "測試" } };
    mock.bookings.mockResolvedValue([row]);
    const response = await GET(req("segment=services&startDate=2026-08-29&endDate=2026-09-04"));
    expect(await response.json()).toMatchObject({ total: 1, attendees: 2, rows: [{ id: "b", detail: "2026-09-01 · 2 人次" }] });
    expect(mock.bookings).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: "own", bookingStatus: "COMPLETED", bookingDate: { gte: new Date("2026-08-29T00:00:00Z"), lte: new Date("2026-09-04T00:00:00Z") } }) }));
  });
});
