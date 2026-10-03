import { beforeEach, describe, expect, it, vi } from "vitest";
import { blocksFrontendPreviewWrite } from "@/lib/frontend-preview";
const mocks = vi.hoisted(() => ({ permission: vi.fn(), check: vi.fn(), link: vi.fn(), store: vi.fn(), feature: vi.fn(), module: vi.fn(), customer: vi.fn(), staff: vi.fn(), visibility: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/permissions", () => ({ requirePermission: mocks.permission, checkPermission: mocks.check }));
vi.mock("@/lib/store", () => ({ validateStoreAccess: mocks.store }));
vi.mock("@/lib/feature-gate", () => ({ requireStoreFeature: mocks.feature }));
vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule: mocks.module }));
vi.mock("@/lib/db", () => ({ prisma: { staffMemberLink: { findFirst: mocks.link }, customer: { findFirst: mocks.customer }, staff: { findFirst: mocks.staff } } }));
vi.mock("@/lib/manager-visibility", () => ({ getManagerCustomerWhere: mocks.visibility }));
import { authorizeFrontendPreview, resolveCoursePreviewIdentity } from "@/server/services/frontend-preview";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.permission.mockResolvedValue({ id: "viewer", role: "OWNER", staffId: "manager", storeId: "own" });
  mocks.check.mockResolvedValue(true);
  mocks.link.mockResolvedValue(null);
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

describe("course preview linked identities", () => {
  const access = { user: { id: "viewer", role: "OWNER", staffId: "manager" }, moduleId: "course", storeId: "store", personId: "person", name: "會員", personUserId: "line-user", role: "member" } as Extract<Awaited<ReturnType<typeof authorizeFrontendPreview>>, { role: "member" }>;
  beforeEach(() => {
    mocks.module.mockResolvedValue("course");
    mocks.link.mockResolvedValue({ staffId: "coach", userId: "line-user", courseMemberEnabled: true });
  });
  it("enables work from the linked member only after work authorization", async () => {
    expect(await resolveCoursePreviewIdentity(access)).toEqual({ customerId: "person", workStaffId: "coach", memberEnabled: true });
    expect(mocks.link).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "store", userId: "line-user", revokedAt: null, staff: { status: "ACTIVE", courseCoachEnabled: true } } }));
    expect(mocks.staff).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "coach", storeId: "store" }) }));
  });
  it.each(["PARTNER", "CUSTOMER"])("does not expand %s access", async role => {
    const result = await resolveCoursePreviewIdentity({ ...access, user: { ...access.user, role: role as typeof access.user.role } });
    expect(result.workStaffId).toBeNull();
    expect(mocks.link).not.toHaveBeenCalled();
  });
  it("does not infer identity from a matching name or absent login", async () => {
    expect((await resolveCoursePreviewIdentity({ ...access, personUserId: null })).workStaffId).toBeNull();
    expect(mocks.link).not.toHaveBeenCalled();
  });
  it("keeps work hidden without personnel permission or an active link", async () => {
    mocks.check.mockResolvedValue(false);
    expect((await resolveCoursePreviewIdentity(access)).workStaffId).toBeNull();
    mocks.check.mockResolvedValue(true);
    mocks.link.mockResolvedValue(null);
    expect((await resolveCoursePreviewIdentity(access)).workStaffId).toBeNull();
  });
  it("rejects an invalid linked coach through existing work checks", async () => {
    mocks.staff.mockResolvedValue(null);
    await expect(resolveCoursePreviewIdentity(access)).rejects.toThrow("沒有符合條件");
  });
  it("enables member from work through the same-store linked account", async () => {
    const result = await resolveCoursePreviewIdentity({ ...access, moduleId: "course", personUserId: "line-user", personId: "coach", role: "work" });
    expect(result).toEqual({ customerId: "person", workStaffId: "coach", memberEnabled: true });
    expect(mocks.customer).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: "store", userId: "line-user", mergedIntoCustomerId: null, assignedStaffId: "manager" }) }));
  });
  it("keeps coach-only identities and restricted member reads separate", async () => {
    mocks.link.mockResolvedValue({ staffId: "coach", userId: "line-user", courseMemberEnabled: false });
    expect((await resolveCoursePreviewIdentity({ ...access, moduleId: "course", personUserId: "line-user", personId: "coach", role: "work" })).memberEnabled).toBe(false);
    expect(mocks.customer).not.toHaveBeenCalled();
    expect((await resolveCoursePreviewIdentity(access)).memberEnabled).toBe(false);
    mocks.link.mockResolvedValue({ staffId: "coach", userId: "line-user", courseMemberEnabled: true });
    mocks.check.mockResolvedValue(false);
    expect((await resolveCoursePreviewIdentity({ ...access, moduleId: "course", personUserId: "line-user", personId: "coach", role: "work" })).memberEnabled).toBe(false);
  });
});
