import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ grant: vi.fn(), staff: vi.fn(), store: vi.fn(), active: vi.fn(), view: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { storeFeatureEntitlement: { findUnique: m.grant }, staff: { findFirst: m.staff }, store: { findFirst: m.store } } }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: m.active }));
vi.mock("@/lib/hq-store-view", () => ({ isHqStoreView: m.view }));
import { isStoreOperationAuditEnabled, resolveOperationAuditScope } from "@/server/services/store-operation-audit-access";
const owner = { id: "owner", role: "OWNER", storeId: "own", staffId: "staff" };
beforeEach(() => { vi.clearAllMocks(); m.view.mockResolvedValue(false); m.active.mockResolvedValue("own"); m.store.mockResolvedValue({ id: "own" }); m.staff.mockResolvedValue({ id: "staff" }); m.grant.mockResolvedValue({ status: "ENABLED", startsAt: null, expiresAt: null }); });
describe("store operation audit scope", () => {
  it.each(["STAFF", "PARTNER", "MANAGER", "CUSTOMER"])("denies %s despite any stale permission/grant", async role => {
    expect(await resolveOperationAuditScope({ ...owner, role })).toBeNull(); expect(m.grant).not.toHaveBeenCalled();
  });
  it("only admits the owner's active staff membership in their own active store", async () => {
    expect(await resolveOperationAuditScope(owner)).toEqual({ hq: false, storeId: "own" });
    expect(m.staff).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "staff", userId: "owner", storeId: "own", status: "ACTIVE", isOwner: true } }));
    expect(m.store).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "own", operatingStatus: { in: ["ACTIVE", "TRIAL"] } } }));
    m.staff.mockResolvedValue(null); expect(await resolveOperationAuditScope(owner)).toBeNull();
    m.staff.mockResolvedValue({ id: "staff" }); m.store.mockResolvedValue(null); expect(await resolveOperationAuditScope(owner)).toBeNull();
  });
  it.each(["child", "other", "__all__", null])("denies selected scope %s", async store => { m.active.mockResolvedValue(store); expect(await resolveOperationAuditScope(owner)).toBeNull(); });
  it("denies absent staff identity", async () => { expect(await resolveOperationAuditScope({ ...owner, staffId: null })).toBeNull(); });
  it("HQ outside store view retains full access without checking grants", async () => { m.active.mockResolvedValue(null); expect(await resolveOperationAuditScope({ ...owner, role: "ADMIN" })).toEqual({ hq: true, storeId: null }); expect(m.grant).not.toHaveBeenCalled(); });
  it("HQ store view obeys grant without changing real actor", async () => {
    const admin = { ...owner, role: "ADMIN" }; m.view.mockResolvedValue(true);
    expect(await resolveOperationAuditScope(admin)).toEqual({ hq: false, storeId: "own" }); expect(admin.role).toBe("ADMIN");
    m.grant.mockResolvedValue(null); expect(await resolveOperationAuditScope(admin)).toBeNull();
  });
  it.each([null, { status: "DISABLED" }, { status: "LOCKED" }, { status: "HIDDEN" }])("default/disabled grant is denied", async grant => { m.grant.mockResolvedValue(grant); expect(await isStoreOperationAuditEnabled("own")).toBe(false); });
  it("uses start-inclusive/expiry-exclusive dates with a fresh read every time", async () => {
    const now = new Date("2026-10-08T00:00:00Z");
    m.grant.mockResolvedValue({ status: "ENABLED", startsAt: now, expiresAt: new Date(now.getTime() + 1) }); expect(await isStoreOperationAuditEnabled("own", now)).toBe(true);
    m.grant.mockResolvedValue({ status: "ENABLED", startsAt: null, expiresAt: now }); expect(await isStoreOperationAuditEnabled("own", now)).toBe(false);
    m.grant.mockResolvedValue({ status: "ENABLED", startsAt: new Date(now.getTime() + 1), expiresAt: null }); expect(await isStoreOperationAuditEnabled("own", now)).toBe(false);
    expect(m.grant).toHaveBeenCalledTimes(3);
  });
});

// Four product modules share a store-keyed grant; this is backend coverage, not UI acceptance.
it.each([
  ["steamfoot", "STEAMFOOT", false], ["spa", "SPA", false],
  ["sports", "COURSE", false], ["music", "COURSE", true],
])("%s audit grant stays independent of other module stores", async (label, industryModule, music) => {
  const own = `fixture-${label}`;
  const user = { id: `owner-${label}`, role: "OWNER", storeId: own, staffId: `staff-${label}` };
  m.active.mockResolvedValue(own);
  m.store.mockResolvedValue({ id: own, industryModule, music });
  m.staff.mockResolvedValue({ id: user.staffId });
  let enabledStore: string | null = null;
  m.grant.mockImplementation(async ({ where }) => where.uq_store_feature_entitlement.storeId === enabledStore
    ? { status: "ENABLED", startsAt: null, expiresAt: null } : null);
  expect(await resolveOperationAuditScope(user)).toBeNull();
  enabledStore = "fixture-other-module";
  expect(await resolveOperationAuditScope(user)).toBeNull();
  enabledStore = own;
  expect(await resolveOperationAuditScope(user)).toEqual({ hq: false, storeId: own });
  for (const role of ["MANAGER", "STAFF"]) expect(await resolveOperationAuditScope({ ...user, role })).toBeNull();
  enabledStore = null;
  expect(await resolveOperationAuditScope(user)).toBeNull();
});
