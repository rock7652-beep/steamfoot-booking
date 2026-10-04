import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ permission: vi.fn(), activeStore: vi.fn(), context: vi.fn(), staff: vi.fn(), module: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ requirePermission: m.permission }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: m.activeStore }));
vi.mock("@/lib/store-context", () => ({ getStoreContext: m.context }));
vi.mock("@/lib/industry-module-server", () => ({ requireSpaStore: m.module }));
vi.mock("@/lib/db", () => ({ prisma: { staff: { findFirst: m.staff } } }));
vi.mock("@/lib/spa-db", () => ({ spaPrisma: {} }));
import { spaResourceStore, spaResourceStoreRead } from "@/server/actions/spa-resources";
beforeEach(() => {
  vi.resetAllMocks();
  m.permission.mockResolvedValue({ id: "hq", role: "ADMIN" });
  m.activeStore.mockResolvedValue("spa-demo");
  m.context.mockResolvedValue(null);
  m.module.mockResolvedValue(undefined);
});
it("allows HQ panel reads through the authorized active store without a shop-route cookie", async () => {
  await expect(spaResourceStoreRead("customer.read")).resolves.toEqual({ storeId: "spa-demo", isChildStoreView: false });
  expect(m.context).not.toHaveBeenCalled();
  expect(m.module).toHaveBeenCalledWith("spa-demo");
});
it("rejects an unauthorized active store before accessing SPA data", async () => {
  m.activeStore.mockRejectedValue(new Error("forbidden"));
  await expect(spaResourceStoreRead("customer.read")).rejects.toThrow("forbidden");
  expect(m.module).not.toHaveBeenCalled();
});
it("requires a concrete selected store", async () => {
  m.activeStore.mockResolvedValue(null);
  await expect(spaResourceStoreRead("customer.read")).rejects.toThrow("請先選擇店家");
  expect(m.module).not.toHaveBeenCalled();
});
it("does not use the read resolver to enable HQ writes", async () => {
  await expect(spaResourceStore("customer.update")).rejects.toThrow("請從店家後台開啟設定");
  expect(m.activeStore).not.toHaveBeenCalled();
});
it("still rejects non-SPA stores", async () => {
  m.module.mockRejectedValue(new Error("wrong module"));
  await expect(spaResourceStoreRead("customer.read")).rejects.toThrow("wrong module");
});
