// Exercise transport behavior separately from the global incident stop.
vi.mock("@/lib/line-delivery-pause", () => ({ isSystemLineDeliveryPaused: () => false }));
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ blocked: vi.fn() }));
vi.mock("@/lib/runtime-env", () => ({ isPreviewExternalIntegrationBlocked: m.blocked }));
import { pushMessage } from "@/lib/line";
const destination = "U" + "a".repeat(32);
beforeEach(() => {
  vi.resetAllMocks(); m.blocked.mockReturnValue(false);
  vi.stubEnv("STORE_LINE_CONFIG_JSON", JSON.stringify([{ storeId: "a", slug: "a", providerId: "901", loginChannelId: "902", messagingProviderId: "901", messagingChannelId: "903", liffId: "902-test", basicId: "@a", destination, accessTokenEnv: "ISOLATED_TOKEN", channelSecretEnv: "ISOLATED_SECRET" }]));
  vi.stubEnv("ISOLATED_TOKEN", "test-only-not-real");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("blocks a valid token belonging to another official account before pushing", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ displayName: "wrong", basicId: "@b", userId: "U" + "b".repeat(32) })));
  vi.stubGlobal("fetch", fetcher);
  expect(await pushMessage("a", "recipient", [{ type: "text", text: "test" }])).toMatchObject({ success: false });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(String(fetcher.mock.calls[0][0])).toMatch(/\/info$/);
});
it("checks bot ownership then preserves the same retry key on push", async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ displayName: "test", basicId: "@a", userId: destination })))
    .mockResolvedValueOnce(new Response("{}"));
  vi.stubGlobal("fetch", fetcher);
  expect(await pushMessage("a", "recipient", [{ type: "text", text: "test" }], "retry")).toMatchObject({ success: true });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1][1].headers["X-Line-Retry-Key"]).toBe("retry");
});
it("does not contact LINE at all while preview sending is disabled", async () => {
  m.blocked.mockReturnValue(true); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  expect(await pushMessage("a", "recipient", [{ type: "text", text: "test" }])).toMatchObject({ success: false, errorType: "preview_blocked" });
  expect(fetcher).not.toHaveBeenCalled();
});
it("uses an additional store's credentials and checks its bot before sending", async () => {
  vi.stubEnv("STORE_LINE_ADDITIONAL_CONFIG_JSON", JSON.stringify([{
    storeId: "store-soulife", slug: "soulife", providerId: "2005295754",
    loginChannelId: "2010761154", messagingProviderId: "2005295754",
    messagingChannelId: "2012197466", liffId: "2010761154-CmcQZ9Db",
    basicId: "@046mqwnp", destination: "U" + "b".repeat(32),
    accessTokenEnv: "LINE_SOULIFE_CHANNEL_ACCESS_TOKEN", channelSecretEnv: "LINE_SOULIFE_CHANNEL_SECRET",
  }]));
  vi.stubEnv("LINE_SOULIFE_CHANNEL_ACCESS_TOKEN", "soulife-test-only");
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ displayName: "test", basicId: "@046mqwnp", userId: "U" + "b".repeat(32) })))
    .mockResolvedValueOnce(new Response("{}"));
  vi.stubGlobal("fetch", fetcher);
  expect(await pushMessage("store-soulife", "recipient", [{ type: "text", text: "test" }])).toMatchObject({ success: true });
  expect(fetcher).toHaveBeenCalledTimes(2);
  for (const [, init] of fetcher.mock.calls) {
    expect(init.headers.Authorization).toBe("Bearer soulife-test-only");
  }
});
