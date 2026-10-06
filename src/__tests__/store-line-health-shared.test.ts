import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ permission: vi.fn(), active: vi.fn(), feature: vi.fn(), store: vi.fn(), stores: vi.fn(), entries: vi.fn(), update: vi.fn(), config: vi.fn(), explicit: vi.fn(), bot: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ requirePermission: m.permission }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: m.active }));
vi.mock("@/lib/feature-gate", () => ({ requireStoreFeature: m.feature }));
vi.mock("@/lib/db", () => ({ prisma: { store: { findUnique: m.store, findMany: m.stores, update: m.update } } }));
vi.mock("@/lib/line", () => ({ getLineBotInfo: m.bot }));
vi.mock("@/lib/line-config", () => ({ getLineConfigForStore: m.config }));
vi.mock("@/lib/store-line-config", () => ({ getConfiguredStoreLine: m.explicit, readStoreLineConfigs: m.entries }));
import { getAllLineOfficialAccountStatuses, getCurrentLineOfficialAccountStatus, checkCurrentLineOfficialAccount } from "@/server/actions/line-official-accounts";
beforeEach(() => {
  vi.resetAllMocks();
  m.entries.mockReturnValue([]);
  m.permission.mockResolvedValue({ role: "OWNER" }); m.active.mockResolvedValue("active-store");
  m.config.mockReturnValue({ accessToken: "fixture", channelSecret: "fixture", expectedBasicId: "@fixture" });
  m.bot.mockResolvedValue({ ok: true, data: { basicId: "@fixture", userId: "bot" } });
});
it("lists both configured shared stores alongside legacy stores without DB writes", async () => {
  m.entries.mockReturnValue([{ storeId: "a", slug: "ido-xinzhuang" }, { storeId: "b", slug: "ido-banqiao" }]);
  m.stores.mockResolvedValue([{ id: "a", slug: "ido-xinzhuang", name: "新莊", lineDestination: null }, { id: "b", slug: "ido-banqiao", name: "板橋", lineDestination: null }]);
  m.explicit.mockReturnValue({ sharedAccountKey: "ufun", destination: "bot" });
  const statuses = await getAllLineOfficialAccountStatuses();
  expect(statuses.map(s => s.storeSlug)).toEqual(["zhubei", "hsinchu", "taichung", "ido-xinzhuang", "ido-banqiao"]);
  expect(statuses.slice(3).map(s => s.status)).toEqual(["NORMAL", "NORMAL"]);
  expect(m.update).not.toHaveBeenCalled();
});
it("does not probe a configured slug mapped to the wrong database store", async () => {
  m.entries.mockReturnValue([{ storeId: "expected", slug: "ido-xinzhuang" }]);
  m.stores.mockResolvedValue([{ id: "wrong", slug: "ido-xinzhuang", name: "新莊", lineDestination: null }]);
  expect((await getAllLineOfficialAccountStatuses()).at(-1)).toMatchObject({ status: "NEEDS_ATTENTION" });
  expect(m.bot).not.toHaveBeenCalled();
});
it("retains a missing configured store as not configured", async () => {
  m.entries.mockReturnValue([{ storeId: "a", slug: "ido-xinzhuang" }]);
  m.stores.mockResolvedValue([]);
  expect((await getAllLineOfficialAccountStatuses()).at(-1)).toMatchObject({ storeSlug: "ido-xinzhuang", status: "NOT_CONFIGURED" });
});
it("verifies and rechecks a shared OA without writing the unique legacy destination", async () => {
  m.store.mockResolvedValue({ id: "active-store", slug: "course-b", name: "Store", lineDestination: null });
  m.explicit.mockReturnValue({ sharedAccountKey: "ufun", destination: "bot" });
  expect(await checkCurrentLineOfficialAccount()).toMatchObject({ success: true, data: { status: "NORMAL" } });
  expect(m.update).not.toHaveBeenCalled();
});
it("rejects a shared bot destination mismatch without trying to repair it", async () => {
  m.store.mockResolvedValue({ id: "active-store", slug: "course-b", name: "Store", lineDestination: "bot" });
  m.explicit.mockReturnValue({ sharedAccountKey: "ufun", destination: "another-bot" });
  expect(await checkCurrentLineOfficialAccount()).toMatchObject({ success: true, data: { status: "NEEDS_ATTENTION" } });
  expect(m.update).not.toHaveBeenCalled();
});
it.each(["zhubei", "hsinchu", "taichung", "new-course", "new-spa"])("uses the same configured health service for %s", async slug => {
  m.store.mockResolvedValue({ id: "active-store", slug, name: "Store", lineDestination: "bot" });
  expect(await getCurrentLineOfficialAccountStatus()).toMatchObject({ storeSlug: slug, status: "NORMAL" });
  expect(m.store).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "active-store" } }));
  expect(m.config).toHaveBeenCalledWith("active-store");
  expect(m.update).not.toHaveBeenCalled();
});
it("reports a new unconfigured store without probing or using another account", async () => {
  m.store.mockResolvedValue({ id: "active-store", slug: "new-course", name: "Store", lineDestination: null });
  m.config.mockReturnValue({ accessToken: null });
  expect(await getCurrentLineOfficialAccountStatus()).toMatchObject({ status: "NOT_CONFIGURED" });
  expect(m.bot).not.toHaveBeenCalled();
});
it("does not read or probe without permission", async () => {
  m.permission.mockRejectedValue(new Error("FORBIDDEN"));
  await expect(getCurrentLineOfficialAccountStatus()).rejects.toThrow("FORBIDDEN");
  expect(m.store).not.toHaveBeenCalled(); expect(m.bot).not.toHaveBeenCalled();
});
it("read-only mismatch inspection never repairs the stored destination", async () => {
  m.store.mockResolvedValue({ id: "active-store", slug: "new-course", name: "Store", lineDestination: "different" });
  expect(await getCurrentLineOfficialAccountStatus()).toMatchObject({ status: "NEEDS_ATTENTION" });
  expect(m.update).not.toHaveBeenCalled();
});
