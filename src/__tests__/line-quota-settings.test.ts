import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ stores: vi.fn(), store: vi.fn(), createMany: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { store: { findMany: m.stores, findFirst: m.store }, lineQuotaSetting: { createMany: m.createMany, upsert: m.upsert } } }));
import { ensureLineQuotaSetting, initializeLineQuotaSettings } from "@/server/services/line-quota-settings";
beforeEach(() => vi.clearAllMocks());
it("initializes all active and trial stores without overwriting explicit opt-outs", async () => {
  m.stores.mockResolvedValue([{ id: "steam" }, { id: "course-trial" }]);
  await initializeLineQuotaSettings();
  expect(m.stores).toHaveBeenCalledWith({ where: { operatingStatus: { in: ["ACTIVE", "TRIAL"] }, isDemo: false, archivedAt: null }, select: { id: true } });
  expect(m.createMany).toHaveBeenCalledWith({ data: [{ storeId: "steam", enabled: true }, { storeId: "course-trial", enabled: true }], skipDuplicates: true });
});
it("new stores default on and existing settings are retained", async () => {
  m.store.mockResolvedValue({ id: "new-store" });
  m.upsert.mockResolvedValue({ storeId: "new-store", enabled: true });
  expect((await ensureLineQuotaSetting("new-store"))?.enabled).toBe(true);
  expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { storeId: "new-store", enabled: true }, update: {} }));
});
it("archived, demo and nonoperating stores cannot be enrolled by a direct request", async () => {
  m.store.mockResolvedValue(null);
  expect(await ensureLineQuotaSetting("inactive")).toBe(null);
  expect(m.upsert).not.toHaveBeenCalled();
});
