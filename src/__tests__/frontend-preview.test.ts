import { beforeEach, describe, expect, it, vi } from "vitest";
import { blocksFrontendPreviewWrite } from "@/lib/frontend-preview";
const mocks = vi.hoisted(() => ({ permission: vi.fn(), store: vi.fn(), feature: vi.fn(), module: vi.fn(), customer: vi.fn(), staff: vi.fn(), visibility: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/permissions", () => ({ requirePermission: mocks.permission }));
vi.mock("@/lib/store", () => ({ validateStoreAccess: mocks.store }));
vi.mock("@/lib/feature-gate", () => ({ requireStoreFeature: mocks.feature }));
vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule: mocks.module }));
vi.mock("@/lib/db", () => ({ prisma: { customer: { findFirst: mocks.customer }, staff: { findFirst: mocks.staff } } }));
vi.mock("@/lib/manager-visibility", () => ({ getManagerCustomerWhere: mocks.visibility }));
import { authorizeFrontendPreview } from "@/server/services/frontend-preview";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.permission.mockResolvedValue({ id: "viewer", role: "OWNER", staffId: "manager", storeId: "own" });
  mocks.store.mockResolvedValue("store");
  mocks.module.mockResolvedValue("steamfoot");
  mocks.visibility.mockReturnValue({ assignedStaffId: "manager" });
  mocks.customer.mockResolvedValue({ id: "person", name: "會員", userId: null });
  mocks.staff.mockResolvedValue({ id: "coach", displayName: "老師", userId: "line-user" });
});
const member = { storeId: "store", personId: "person", role: "member" as const };
describe("preview authorization", () => {
  it("keeps manager identity and requires customer, booking and wallet reads", async () => {
    const access = await authorizeFrontendPreview(member);
    expect(access.user.id).toBe("viewer");
    expect(access.personUserId).toBeNull();
    expect(mocks.permission.mock.calls.map(call => call[0])).toEqual(["customer.read", "booking.read", "wallet.read"]);
    expect(mocks.customer).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: "store", id: "person", assignedStaffId: "manager", mergedIntoCustomerId: null }) }));
  });
  it("rejects unrelated stores before querying people", async () => {
    mocks.store.mockRejectedValue(new Error("denied"));
    await expect(authorizeFrontendPreview(member)).rejects.toThrow("denied");
    expect(mocks.customer).not.toHaveBeenCalled();
    expect(mocks.feature).not.toHaveBeenCalled();
  });
  it.each(["hidden", "locked", "expired"])("blocks %s entitlement before reading people", async () => {
    mocks.feature.mockRejectedValue(new Error("not enabled"));
    await expect(authorizeFrontendPreview(member)).rejects.toThrow("not enabled");
    expect(mocks.customer).not.toHaveBeenCalled();
  });
  it("rejects forged or merged member ids", async () => {
    mocks.customer.mockResolvedValue(null);
    await expect(authorizeFrontendPreview(member)).rejects.toThrow("沒有符合條件");
  });
  it("rejects work preview for partners even with personnel read permission", async () => {
    mocks.permission.mockResolvedValue({ id: "viewer", role: "PARTNER" });
    mocks.module.mockResolvedValue("course");
    await expect(authorizeFrontendPreview({ ...member, role: "work" })).rejects.toThrow("需店長權限");
    expect(mocks.staff).not.toHaveBeenCalled();
  });
  it("scopes course work to active coaches in selected store", async () => {
    mocks.module.mockResolvedValue("course");
    await authorizeFrontendPreview({ ...member, role: "work" });
    expect(mocks.staff).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "person", storeId: "store", status: "ACTIVE", courseCoachEnabled: true } }));
    expect(mocks.customer).not.toHaveBeenCalled();
  });
  it("supports SPA work without granting a LINE login", async () => {
    mocks.module.mockResolvedValue("spa");
    const access = await authorizeFrontendPreview({ ...member, role: "work" });
    expect(access.user.id).toBe("viewer");
    expect(access.personId).toBe("coach");
  });
  it("does not invent a steamfoot work portal", async () => {
    await expect(authorizeFrontendPreview({ ...member, role: "work" })).rejects.toThrow("沒有工作前台");
  });
});
describe("GET-only preview transport", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE"])("rejects %s on preview itself", method => {
    expect(blocksFrontendPreviewWrite(method, "/frontend-preview", null)).toBe(true);
    expect(blocksFrontendPreviewWrite(method, "/s/course/admin/dashboard/frontend-preview", null)).toBe(true);
  });
  it("rejects writes to another action/API from preview", () => {
    expect(blocksFrontendPreviewWrite("POST", "/api/pay", "https://www.steamfoot.com/frontend-preview?personId=x")).toBe(true);
  });
  it("allows GET refresh and ordinary live writes", () => {
    expect(blocksFrontendPreviewWrite("GET", "/frontend-preview", null)).toBe(false);
    expect(blocksFrontendPreviewWrite("POST", "/s/course/book", "https://www.steamfoot.com/s/course/book")).toBe(false);
    expect(blocksFrontendPreviewWrite("POST", "/api/payment/webhook", null)).toBe(false);
  });
});
