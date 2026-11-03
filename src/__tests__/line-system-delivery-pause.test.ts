import { afterEach, expect, it, vi } from "vitest";
import { pushMessage, pushSteamButlerMessage, replyMessage, replySteamButlerMessage } from "@/lib/line";
import { isSystemLineDeliveryPaused } from "@/lib/line-delivery-pause";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("blocks all store and central push/reply paths before config, credentials or network I/O", async () => {
  // Even malformed config cannot bypass the incident stop.
  vi.stubEnv("STORE_LINE_CONFIG_JSON", "invalid");
  vi.stubEnv("VERCEL_ENV", "production");
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  const messages = [{ type: "text" as const, text: "must never leave this process" }];
  expect(isSystemLineDeliveryPaused()).toBe(true);
  const results = await Promise.all([
    pushMessage("steamfoot", "customer", messages, "queued-retry"),
    pushMessage("store-silverlily", "customer", messages),
    pushMessage("store-ido-xinzhuang", "customer", messages),
    pushSteamButlerMessage("customer", messages, "central-retry"),
    replyMessage("steamfoot", "reply", messages),
    replyMessage("store-ido-banqiao", "reply", messages),
    replySteamButlerMessage("reply", messages),
  ]);
  for (const result of results) expect(result).toMatchObject({ success: false, errorType: "delivery_paused" });
  expect(fetchMock).not.toHaveBeenCalled();
});
