import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ store: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { store: { findUnique: m.store } } }));
import { assertStoreLiffContext, resolveStoreLiffContext } from "@/server/services/store-liff-context";
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("STORE_LINE_CONFIG_JSON", ""); vi.stubEnv("CENTRAL_MEMBER_LINE_LOGIN_CHANNEL_ID", "2010"); });
afterEach(() => vi.unstubAllEnvs());
it.each([null, "999-independent"])("rejects central tokens for a course store with missing/mismatched LIFF %s", async liffId => {
  m.store.mockResolvedValue({ industryModule: "COURSE", liffId });
  await expect(assertStoreLiffContext({ id: "a", slug: "a" }, resolveStoreLiffContext("a"))).rejects.toThrow("channel");
});
it("preserves an explicitly configured legacy central course store", async () => {
  m.store.mockResolvedValue({ industryModule: "COURSE", liffId: "2010-existing" });
  await expect(assertStoreLiffContext({ id: "a", slug: "a" }, resolveStoreLiffContext("a"))).resolves.toBeUndefined();
});
it.each(["STEAMFOOT", "SPA"])("preserves legacy %s central routing", async industryModule => {
  m.store.mockResolvedValue({ industryModule, liffId: null });
  await expect(assertStoreLiffContext({ id: "a", slug: "a" }, resolveStoreLiffContext("a"))).resolves.toBeUndefined();
});
