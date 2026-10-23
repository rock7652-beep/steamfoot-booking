import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ permission: vi.fn(), store: vi.fn(), feature: vi.fn(), lock: vi.fn(), find: vi.fn(), upsert: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ requirePermission: m.permission }));
vi.mock("@/lib/store", () => ({ resolveWriteStoreId: m.store }));
vi.mock("@/lib/feature-gate", () => ({ requireStoreFeature: m.feature }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: async (work: (tx: unknown) => unknown) => work({ $queryRaw: m.lock, sessionBalanceNotificationSetting: { findUnique: m.find, upsert: m.upsert } }) } }));
import { setSessionBalanceNotificationToggle } from "@/server/actions/session-balance-notification-toggle";
beforeEach(() => { vi.resetAllMocks(); m.permission.mockResolvedValue({ id: "owner" }); m.store.mockResolvedValue("store-a"); m.find.mockResolvedValue({ lastSessionEnabled: false, planUsedUpEnabled: true }); });
it("updates only the requested preference and derives the master flag from the locked database state", async () => {
 expect(await setSessionBalanceNotificationToggle({ key: "lastSessionEnabled", enabled: true })).toEqual({ success: true });
 expect(m.permission).toHaveBeenCalledWith("business_hours.manage"); expect(m.lock.mock.calls[0][1]).toBe("store-a");
 expect(m.upsert.mock.calls[0][0]).toMatchObject({ where: { storeId: "store-a" }, update: { lastSessionEnabled: true, isEnabled: true } });
 expect(m.upsert.mock.calls[0][0].update).not.toHaveProperty("planUsedUpEnabled");
});
it("turns the master flag off only when both persisted preferences are off", async () => {
 await setSessionBalanceNotificationToggle({ key: "planUsedUpEnabled", enabled: false });
 expect(m.upsert.mock.calls[0][0].update).toEqual({ planUsedUpEnabled: false, isEnabled: false });
});
it("uses existing defaults for a new store while changing only the requested field", async () => {
 m.find.mockResolvedValue(null); await setSessionBalanceNotificationToggle({ key: "planUsedUpEnabled", enabled: false });
 expect(m.upsert.mock.calls[0][0].create).toMatchObject({ storeId: "store-a", lastSessionEnabled: true, planUsedUpEnabled: false, isEnabled: true });
});
it("rejects unknown preference names", async () => { expect((await setSessionBalanceNotificationToggle({ key: "storeId", enabled: true })).success).toBe(false); expect(m.upsert).not.toHaveBeenCalled(); });
it("does not write after permission rejection", async () => { m.permission.mockRejectedValue(new Error("Denied")); expect((await setSessionBalanceNotificationToggle({ key: "lastSessionEnabled", enabled: false })).success).toBe(false); expect(m.lock).not.toHaveBeenCalled(); });
