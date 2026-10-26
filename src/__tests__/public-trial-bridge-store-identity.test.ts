import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const m = vi.hoisted(() => ({
  effect: undefined as undefined | (() => void | (() => void)),
  state: vi.fn(), init: vi.fn(), inLine: vi.fn(), token: vi.fn(),
  friendship: vi.fn(), replace: vi.fn(), fetch: vi.fn(),
}));
vi.mock("react", async () => ({
  ...await vi.importActual<typeof import("react")>("react"),
  useEffect: (effect: () => void | (() => void)) => { m.effect = effect; },
  useState: () => ["loading", m.state],
}));
vi.mock("next/image", () => ({ default: (props: Record<string, unknown>) => {
  const imageProps = {...props}; delete imageProps.unoptimized;
  return createElement("img", imageProps);
} }));
vi.mock("@/lib/liff/client", () => ({ initLiff: m.init, isInLineClient: m.inLine, getIDToken: m.token }));
import { PublicTrialLiffBridge } from "@/app/(liff)/liff/public-trial/public-trial-liff-bridge";

beforeEach(() => {
  vi.resetAllMocks();
  m.init.mockResolvedValue({ getFriendship: m.friendship });
  m.friendship.mockResolvedValue({ friendFlag: false });
  m.inLine.mockReturnValue(true);
  m.token.mockReturnValue("test-id-token");
  vi.stubGlobal("window", { location: { origin: "https://preview.example", replace: m.replace } });
  vi.stubGlobal("fetch", m.fetch);
});
afterEach(() => vi.unstubAllGlobals());

function start(storeSlug = "zhubei") {
  renderToStaticMarkup(createElement(PublicTrialLiffBridge, {
    liffId: "test-liff", storeSlug, storeName: "測試門市", contactUrl: "https://line.me/test",
  }));
  return m.effect?.();
}

describe("store identity is independent of platform OA friendship", () => {
  it.each(["zhubei", "hsinchu", "taichung"])("opens verified %s booking without requiring platform friendship", async storeSlug => {
    m.fetch.mockResolvedValue({ json: async () => ({ status: "ok", entry: "verified-entry" }) });
    start(storeSlug);
    const pilotQuery = storeSlug === "zhubei" ? "&lineTrial=1" : "";
    await vi.waitFor(() => expect(m.replace).toHaveBeenCalledWith(`https://preview.example/pricing/experience/${storeSlug}/book?entry=verified-entry${pilotQuery}#booking-form`));
    expect(m.friendship).not.toHaveBeenCalled();
    expect(JSON.parse(m.fetch.mock.calls[0][1].body)).toEqual({ idToken: "test-id-token", storeSlug });
  });
  it("preserves the existing public fallback when the login identity is incompatible", async () => {
    m.fetch.mockResolvedValue({ json: async () => ({ status: "error", code: "IDENTITY_SCOPE_MISMATCH" }) });
    start();
    await vi.waitFor(() => expect(m.replace).toHaveBeenCalledWith("https://preview.example/pricing/experience/zhubei/book?source=line#booking-form"));
  });
  it("does not open an anonymous form when verification is unavailable", async () => {
    m.fetch.mockRejectedValue(new Error("network"));
    start();
    await vi.waitFor(() => expect(m.state).toHaveBeenCalledWith("unavailable"));
    expect(m.replace).not.toHaveBeenCalled();
  });
  it("routes a verified beauty entry back to that beauty form", async () => {
    m.fetch.mockResolvedValue({ json: async () => ({ status: "ok", entry: "verified-entry" }) });
    renderToStaticMarkup(createElement(PublicTrialLiffBridge, { liffId: "902-beauty", storeSlug: "soulife", storeName: "舒生活", contactUrl: "https://line.me/test", bookingPath: "/beauty-trial/soulife" }));
    m.effect?.();
    await vi.waitFor(() => expect(m.replace).toHaveBeenCalledWith("https://preview.example/beauty-trial/soulife?entry=verified-entry#booking-form"));
  });
  it("starts official external LINE Login without minting an entry first", async () => {
    m.inLine.mockReturnValue(false);
    const login = vi.fn(); m.init.mockResolvedValue({ isLoggedIn: () => false, login });
    start();
    await vi.waitFor(() => expect(login).toHaveBeenCalledOnce());
    expect(m.fetch).not.toHaveBeenCalled(); expect(m.replace).not.toHaveBeenCalled();
  });
});
