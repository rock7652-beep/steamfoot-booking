import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ action: vi.fn(), fetch: vi.fn() }));
vi.mock("@/server/actions/store-switch", () => ({ switchActiveStore: m.action }));
import { switchHqStoreView } from "@/lib/hq-store-switch-client";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("window", { location: { pathname: "/hq/dashboard/frontend-preview" } });
  vi.stubGlobal("fetch", m.fetch);
});
afterEach(() => vi.unstubAllGlobals());
it("switches from HQ preview without posting a Server Action to the protected preview page", async () => {
  m.fetch.mockResolvedValue(Response.json({ success: true }));
  expect((await switchHqStoreView("ido")).success).toBe(true);
  expect(m.action).not.toHaveBeenCalled();
  expect(m.fetch).toHaveBeenCalledWith("/api/hq/store-view", expect.objectContaining({ method: "POST", credentials: "same-origin", body: JSON.stringify({ storeId: "ido" }) }));
});
it("retains ordinary authenticated switching outside HQ preview", async () => {
  vi.stubGlobal("window", { location: { pathname: "/hq/dashboard" } });
  m.action.mockResolvedValue({ success: true });
  expect((await switchHqStoreView("music")).success).toBe(true);
  expect(m.action).toHaveBeenCalledWith("music");
  expect(m.fetch).not.toHaveBeenCalled();
});
it("reports unexpected or failed transport without an uncaught global error", async () => {
  m.fetch.mockResolvedValue(new Response("not JSON", { status: 403 }));
  expect((await switchHqStoreView("ido")).success).toBe(false);
  m.fetch.mockRejectedValue(new Error("network unavailable"));
  expect((await switchHqStoreView("__all__")).success).toBe(false);
});
