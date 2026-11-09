import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ actor: vi.fn(), find: vi.fn(), access: vi.fn(), start: vi.fn(), secret: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ requirePermission: m.actor }));
vi.mock("@/lib/db", () => ({ prisma: { customer: { findUnique: m.find } } }));
vi.mock("@/lib/manager-visibility", () => ({ assertStoreAccess: m.access }));
vi.mock("@/server/services/phone-line-rebind", () => ({ startPhoneLineRebind: m.start }));
vi.mock("@/lib/line-config", () => ({ getLineSecretForStore: m.secret }));
vi.mock("@/server/services/line-rebind", () => ({ cancelLineRebindRequest: vi.fn(), createLineRebindRequest: vi.fn() }));
import { startPhoneLineRebindAction } from "@/server/actions/line-rebind";
const id = "clxyz12345678901234567890";
beforeEach(() => { vi.resetAllMocks(); m.actor.mockResolvedValue({ id: "actor", role: "OWNER", storeId: "store-a" }); m.find.mockResolvedValue({ storeId: "store-a" }); m.secret.mockReturnValue("test-secret"); });
it("requires the rebind permission and starts only in the authorized customer store", async () => {
  expect((await startPhoneLineRebindAction(id)).success).toBe(true);
  expect(m.actor).toHaveBeenCalledWith("customer.identity.rebind");
  expect(m.access).toHaveBeenCalledWith(expect.objectContaining({ role: "OWNER" }), "store-a");
  expect(m.start).toHaveBeenCalledWith({ customerId: id, storeId: "store-a", actorUserId: "actor" });
});
it("rejects staff even if permission was granted", async () => {
  m.actor.mockResolvedValue({ id: "staff", role: "STAFF", storeId: "store-a" });
  expect((await startPhoneLineRebindAction(id)).success).toBe(false);
  expect(m.start).not.toHaveBeenCalled();
});
it("rejects a cross-store request before creating an intent", async () => {
  m.find.mockResolvedValue({ storeId: "store-b" }); m.access.mockImplementation(() => { throw new Error("FORBIDDEN"); });
  expect((await startPhoneLineRebindAction(id)).success).toBe(false);
  expect(m.start).not.toHaveBeenCalled();
});
it("reports missing store LINE configuration without starting a request", async () => {
  m.secret.mockReturnValue(null);
  expect((await startPhoneLineRebindAction(id)).success).toBe(false);
  expect(m.start).not.toHaveBeenCalled();
});
