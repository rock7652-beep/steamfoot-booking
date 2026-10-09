import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), scope: vi.fn(), safe: vi.fn(), guard: vi.fn(), store: vi.fn(), access: vi.fn(), history: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: m.user }));
vi.mock("@/server/services/store-operation-audit-access", () => ({ resolveOperationAuditScope: m.scope }));
vi.mock("@/server/services/store-operation-audit-reader", () => ({ readStoreOperationAudits: m.safe }));
vi.mock("@/lib/permissions", () => ({ requirePermission: m.guard }));
vi.mock("@/lib/store", () => ({ resolveWriteStoreId: m.store }));
vi.mock("@/lib/manager-visibility", () => ({ assertStoreAccess: m.access }));
vi.mock("@/server/services/operation-audit", () => ({ getOperationHistory: m.history }));
vi.mock("@/server/services/audit-presentation", () => ({ resolveAuditPresentation: vi.fn(async () => new Map()) }));
import { loadOperationHistory } from "@/server/actions/operation-audit";
beforeEach(() => {
  vi.clearAllMocks(); const user = { id: "u", role: "ADMIN", storeId: "own" };
  m.user.mockResolvedValue(user); m.guard.mockResolvedValue(user); m.scope.mockResolvedValue({ hq: true, storeId: "own" });
  m.store.mockResolvedValue("own"); m.access.mockReturnValue(undefined); m.history.mockResolvedValue([]); m.safe.mockResolvedValue({ items: [] });
});
it("stops unauthorized history before any query", async () => {
  m.guard.mockRejectedValue(new Error("denied"));
  expect((await loadOperationHistory({ targetType: "Booking", targetId: "foreign" })).success).toBe(false);
  expect(m.guard).toHaveBeenCalledWith("audit.read"); expect(m.history).not.toHaveBeenCalled(); expect(m.safe).not.toHaveBeenCalled();
});
it("queries the authorized HQ store even if a foreign target is supplied", async () => {
  await loadOperationHistory({ targetType: "Booking", targetId: "foreign" });
  expect(m.access).toHaveBeenCalledWith(expect.objectContaining({ id: "u" }), "own");
  expect(m.history).toHaveBeenCalledWith(expect.objectContaining({ storeId: "own", targetId: "foreign" }));
});
it("stops denied store scope before reading even with a legacy permission", async () => {
  m.scope.mockResolvedValue(null);
  expect((await loadOperationHistory({ targetType: "Booking", targetId: "own" })).success).toBe(false);
  expect(m.history).not.toHaveBeenCalled(); expect(m.safe).not.toHaveBeenCalled();
});
it("uses only the safe reader and server-resolved own-store scope for store owners", async () => {
  m.scope.mockResolvedValue({ hq: false, storeId: "own" });
  await loadOperationHistory({ targetType: "Booking", targetId: "foreign", limit: 20 });
  expect(m.guard).toHaveBeenCalledWith("store.audit.read");
  expect(m.safe).toHaveBeenCalledWith({ storeId: "own", targetType: "Booking", targetId: "foreign", limit: 20 });
  expect(m.history).not.toHaveBeenCalled(); expect(m.store).not.toHaveBeenCalled();
});
it.each(["StaffPermission", "User", "StoreView", "CustomerIdentityLink"])("denies store history for %s before reading", async targetType => {
  m.scope.mockResolvedValue({ hq: false, storeId: "own" });
  expect((await loadOperationHistory({ targetType, targetId: "own" })).success).toBe(false);
  expect(m.safe).not.toHaveBeenCalled(); expect(m.history).not.toHaveBeenCalled();
});
