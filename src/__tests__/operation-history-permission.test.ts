import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ guard: vi.fn(), store: vi.fn(), access: vi.fn(), history: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ requirePermission: m.guard }));
vi.mock("@/lib/store", () => ({ resolveWriteStoreId: m.store }));
vi.mock("@/lib/manager-visibility", () => ({ assertStoreAccess: m.access }));
vi.mock("@/server/services/operation-audit", () => ({ getOperationHistory: m.history }));
import { loadOperationHistory } from "@/server/actions/operation-audit";
beforeEach(() => { vi.clearAllMocks(); m.guard.mockResolvedValue({ id: "u", role: "MANAGER", storeId: "own" }); m.store.mockResolvedValue("own"); m.access.mockReturnValue(undefined); m.history.mockResolvedValue([]); });
it("stops unauthorized history before any query", async () => {
  m.guard.mockRejectedValue(new Error("denied"));
  expect((await loadOperationHistory({ targetType: "Booking", targetId: "foreign" })).success).toBe(false);
  expect(m.guard).toHaveBeenCalledWith("audit.read");
  expect(m.history).not.toHaveBeenCalled();
});
it("queries the authorized store even if a foreign target is supplied", async () => {
  await loadOperationHistory({ targetType: "Booking", targetId: "foreign" });
  expect(m.access).toHaveBeenCalledWith(expect.objectContaining({ id: "u" }), "own");
  expect(m.history).toHaveBeenCalledWith(expect.objectContaining({ storeId: "own", targetId: "foreign" }));
});
