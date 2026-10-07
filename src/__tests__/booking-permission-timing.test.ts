vi.mock("@/lib/store", () => ({ getActiveStoreForRead: async () => "store-a" }));
vi.mock("@/lib/feature-gate", () => ({ requireStoreFeature: async () => {} }));
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ session: vi.fn(), grant: vi.fn(), subscription: vi.fn(), store: vi.fn(), writable: vi.fn() }));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/db", () => ({ prisma: { staffPermission: { findMany: m.grant } } }));
vi.mock("@/lib/session", () => ({ requireStaffSession: m.session }));
vi.mock("@/lib/subscription-guard", () => ({ assertStoreSubscriptionWritable: m.subscription }));
vi.mock("@/lib/store-organization", () => ({ resolveStoreViewContext: m.store, assertWritableStoreViewContext: m.writable }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
import { requireWritablePermission } from "@/lib/permissions";
import { OperationTiming } from "@/lib/operation-timing";
beforeEach(() => {
  vi.resetAllMocks();
  m.session.mockResolvedValue({ role: "STAFF", staffId: "staff-a", storeId: "store-a" });
  m.grant.mockResolvedValue([{ permission: "booking.update" }]);
  m.store.mockResolvedValue({ canWrite: true });
});
it("times every guard while preserving the authorized result", async () => {
  const timing = new OperationTiming("test");
  const measure = vi.spyOn(timing, "measure");
  const user = await requireWritablePermission("booking.update", undefined, timing);
  expect(user.storeId).toBe("store-a");
  expect(measure.mock.calls.map(([name]) => name)).toEqual([
    "permission.session", "permission.grant", "permission.subscription", "permission.cookie", "permission.store",
  ]);
  expect(m.subscription).toHaveBeenCalledWith("store-a");
  expect(m.writable).toHaveBeenCalledWith({ canWrite: true });
});
it.each(["session", "grant", "subscription", "store"] as const)("propagates %s failure without continuing authorization", async (stage) => {
  m[stage].mockRejectedValue(new Error("denied"));
  const timing = new OperationTiming("test");
  await expect(requireWritablePermission("booking.update", undefined, timing)).rejects.toThrow("denied");
  expect(m.writable).not.toHaveBeenCalled();
  if (stage !== "store") expect(m.store).not.toHaveBeenCalled();
});
it("rejects missing grants before subscription and store checks", async () => {
  m.grant.mockResolvedValue([]);
  await expect(requireWritablePermission("booking.update", undefined, new OperationTiming("test"))).rejects.toThrow("權限");
  expect(m.subscription).not.toHaveBeenCalled();
  expect(m.store).not.toHaveBeenCalled();
});
it("keeps uninstrumented callers working", async () => {
  await expect(requireWritablePermission("booking.update", { viewedStoreId: "store-a" })).resolves.toMatchObject({ storeId: "store-a" });
  expect(m.store).toHaveBeenCalledWith(expect.anything(), { viewedStoreId: "store-a" });
});
