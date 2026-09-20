import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ permission: vi.fn(), active: vi.fn(), feature: vi.fn(), store: vi.fn(), update: vi.fn(), config: vi.fn(), bot: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ requirePermission: m.permission }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: m.active }));
vi.mock("@/lib/feature-gate", () => ({ requireStoreFeature: m.feature }));
vi.mock("@/lib/db", () => ({ prisma: { store: { findUnique: m.store, update: m.update } } }));
vi.mock("@/lib/line", () => ({ getLineBotInfo: m.bot }));
vi.mock("@/lib/line-config", () => ({ getLineConfigForStore: m.config }));
import { getCurrentLineOfficialAccountStatus } from "@/server/actions/line-official-accounts";
beforeEach(() => {
  vi.resetAllMocks();
  m.permission.mockResolvedValue({ role: "OWNER" }); m.active.mockResolvedValue("active-store");
  m.config.mockReturnValue({ accessToken: "fixture", channelSecret: "fixture", expectedBasicId: "@fixture" });
  m.bot.mockResolvedValue({ ok: true, data: { basicId: "@fixture", userId: "bot" } });
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
