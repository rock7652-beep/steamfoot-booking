// Exercise transport behavior separately from the global incident stop.
vi.mock("@/lib/line-delivery-pause", () => ({ isSystemLineDeliveryPaused: () => false }));
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ after: vi.fn(), store: vi.fn(), central: vi.fn() }));
vi.mock("next/server", () => ({ after: m.after }));
vi.mock("@/lib/runtime-env", () => ({ isPreviewExternalIntegrationBlocked: () => false }));
vi.mock("@/lib/line-config", async original => ({ ...await original<typeof import("@/lib/line-config")>(), getLineAccessTokenForStore: () => "fixture", getSteamButlerLineAccessToken: () => "central-fixture" }));
vi.mock("@/server/services/line-quota-monitor", () => ({ notifyLineQuotaExhausted: m.store, notifyCentralLineQuotaExhausted: m.central }));
import { pushMessage, pushSteamButlerMessage } from "@/lib/line";
beforeEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });
it("defers exhaustion email until the booking transaction and request finish", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({ message: "You have reached your monthly limit." }) }));
  const result = await pushMessage("store-a", "recipient-fixture", [{ type: "text", text: "fixture" }]);
  expect(result.success).toBe(false); expect(result.httpStatus).toBe(429);
  expect(m.after).toHaveBeenCalledOnce(); expect(m.store).not.toHaveBeenCalled();
  await m.after.mock.calls[0][0](); expect(m.store).toHaveBeenCalledWith("store-a");
});
it("shared OA failures notify via the central path", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({ message: "You have reached your monthly limit." }) }));
  await pushSteamButlerMessage("recipient-fixture", [{ type: "text", text: "fixture" }]);
  await m.after.mock.calls[0][0](); expect(m.central).toHaveBeenCalledOnce(); expect(m.store).not.toHaveBeenCalled();
});
it("rate limits do not trigger monthly-quota emails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({ message: "Too many requests." }) }));
  await pushMessage("store-a", "recipient-fixture", [{ type: "text", text: "fixture" }]);
  expect(m.after).not.toHaveBeenCalled();
});
