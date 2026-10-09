import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), grant: vi.fn(), staff: vi.fn(), store: vi.fn(), active: vi.fn(), view: vi.fn(), safe: vi.fn(), guard: vi.fn(), history: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { storeFeatureEntitlement: { findUnique: m.grant }, staff: { findFirst: m.staff }, store: { findFirst: m.store } } }));
vi.mock("@/lib/session", () => ({ getCurrentUser: m.user }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: m.active, resolveWriteStoreId: m.active }));
vi.mock("@/lib/hq-store-view", () => ({ isHqStoreView: m.view }));
vi.mock("@/server/services/store-operation-audit-reader", () => ({ readStoreOperationAudits: m.safe }));
vi.mock("@/lib/permissions", () => ({ requirePermission: m.guard }));
vi.mock("@/lib/manager-visibility", () => ({ assertStoreAccess: vi.fn() }));
vi.mock("@/server/services/operation-audit", () => ({ getOperationHistory: m.history }));
vi.mock("@/server/services/audit-presentation", () => ({ resolveAuditPresentation: vi.fn(async () => new Map()) }));
import { loadOperationHistory } from "@/server/actions/operation-audit";
const owner = { id: "fixture-owner", role: "OWNER", storeId: "fixture-own", staffId: "fixture-staff" };
const target = { targetType: "Booking", targetId: "fixture-booking" };
beforeEach(() => {
  vi.clearAllMocks();
  m.user.mockResolvedValue(owner); m.guard.mockResolvedValue(owner);
  m.view.mockResolvedValue(false); m.active.mockResolvedValue(owner.storeId);
  m.staff.mockResolvedValue({ id: owner.staffId }); m.store.mockResolvedValue({ id: owner.storeId });
  m.safe.mockResolvedValue({ items: [] }); m.history.mockResolvedValue([]);
  m.grant.mockResolvedValue({ status: "ENABLED", startsAt: null, expiresAt: null });
});
it.each([
  null, { status: "HIDDEN" }, { status: "DISABLED" },
  { status: "ENABLED", startsAt: null, expiresAt: new Date("2000-01-01T00:00:00Z") },
])("rereads entitlement and denies a revoked/expired same-session action before history lookup: %j", async revoked => {
  expect((await loadOperationHistory(target)).success).toBe(true);
  expect(m.safe).toHaveBeenCalledOnce();
  m.grant.mockResolvedValue(revoked);
  expect((await loadOperationHistory(target)).success).toBe(false);
  expect(m.grant).toHaveBeenCalledTimes(2);
  expect(m.safe).toHaveBeenCalledOnce(); expect(m.history).not.toHaveBeenCalled();
});
it("denies a removed owner membership in the same session before history or entitlement lookup", async () => {
  expect((await loadOperationHistory(target)).success).toBe(true);
  m.staff.mockResolvedValue(null);
  expect((await loadOperationHistory(target)).success).toBe(false);
  expect(m.staff).toHaveBeenCalledTimes(2); expect(m.grant).toHaveBeenCalledOnce(); expect(m.safe).toHaveBeenCalledOnce();
});
