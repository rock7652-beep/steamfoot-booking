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
