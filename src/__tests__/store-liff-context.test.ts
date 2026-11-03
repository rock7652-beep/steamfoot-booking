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

const beautyConfig = {
  storeId: "store-soulife", slug: "soulife", identityMode: "CENTRAL",
  providerId: "2005295754", loginChannelId: "2010761154", messagingProviderId: "2005295754",
  messagingChannelId: "2012197466", liffId: "2010761154-CmcQZ9Db", basicId: "@046mqwnp",
  destination: "U" + "b".repeat(32), accessTokenEnv: "LINE_SOULIFE_CHANNEL_ACCESS_TOKEN",
  channelSecretEnv: "LINE_SOULIFE_CHANNEL_SECRET",
};
function beautyContext() {
  vi.stubEnv("CENTRAL_LINE_PROVIDER_ID", beautyConfig.providerId);
  vi.stubEnv("STORE_LINE_ADDITIONAL_CONFIG_JSON", JSON.stringify([beautyConfig]));
  return resolveStoreLiffContext("soulife");
}
it("accepts the registered beauty store and preserves its central account namespace", async () => {
  const context = beautyContext();
  m.store.mockResolvedValue({ industryModule: "BEAUTY", liffId: null });
  expect(context).toMatchObject({ channelId: "2010761154", identityProvider: "line" });
  await expect(assertStoreLiffContext({ id: "store-soulife", slug: "soulife" }, context)).resolves.toBeUndefined();
});
it.each([
  { industryModule: "BEAUTY", liffId: "2010761154-another-store" },
  { industryModule: "STEAMFOOT", liffId: null },
  { industryModule: "SPA", liffId: null },
])("rejects a conflicting module or LIFF for a registered store %j", row => {
  const context = beautyContext();
  m.store.mockResolvedValue(row);
  return expect(assertStoreLiffContext({ id: "store-soulife", slug: "soulife" }, context)).rejects.toThrow();
});
it("does not authorize another store with the beauty store's context", async () => {
  const context = beautyContext();
  m.store.mockResolvedValue({ industryModule: "BEAUTY", liffId: beautyConfig.liffId });
  await expect(assertStoreLiffContext({ id: "other", slug: "other" }, context)).rejects.toThrow("店家設定不匹配");
});
