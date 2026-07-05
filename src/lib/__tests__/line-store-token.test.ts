import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  pushMessage,
  verifyLineSignature,
  LINE_TOKEN_NOT_CONFIGURED_ERROR,
} from "@/lib/line";
import { getLineWebhookDiagnosticsForStore } from "@/lib/line-config";

function mockLineOk() {
  const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) => ({
    ok: true,
    json: async () => ({}),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("store-aware LINE Messaging config", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each([
    ["e182e256-98ca-4c78-970b-d4b118066c51", "LINE_CHANNEL_ACCESS_TOKEN", "zhubei-token"],
    ["store-hsinchu", "LINE_HSINCHU_CHANNEL_ACCESS_TOKEN", "hsinchu-token"],
    ["store-taichung", "LINE_TAICHUNG_CHANNEL_ACCESS_TOKEN", "taichung-token"],
  ])("pushMessage(%s) uses the matching store token", async (storeId, envKey, token) => {
    vi.stubEnv(envKey, token);
    const fetchMock = mockLineOk();

    const result = await pushMessage(storeId, "U_customer", [
      { type: "text", text: "hello" },
    ]);

    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1];
    expect(init?.headers).toMatchObject({
      Authorization: `Bearer ${token}`,
    });
  });

  it("reports hsinchu LINE_HSINCHU webhook config when enabled", () => {
    vi.stubEnv("LINE_HSINCHU_CHANNEL_ACCESS_TOKEN", "hsinchu-token");
    vi.stubEnv("LINE_HSINCHU_CHANNEL_SECRET", "hsinchu-secret");

    expect(getLineWebhookDiagnosticsForStore("store-hsinchu")).toEqual({
      storeSlug: "hsinchu",
      secretEnvName: "LINE_HSINCHU_CHANNEL_SECRET",
      hasSecret: true,
      secretLength: "hsinchu-secret".length,
      hasAccessToken: true,
    });
  });

  it("fails closed when hsinchu token is missing", async () => {
    vi.stubEnv("LINE_HSINCHU_CHANNEL_SECRET", "hsinchu-secret");
    const fetchMock = mockLineOk();

    const result = await pushMessage("store-hsinchu", "U_customer", [
      { type: "text", text: "hello" },
    ]);

    expect(result).toEqual({
      success: false,
      error: LINE_TOKEN_NOT_CONFIGURED_ERROR,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not fallback hsinchu to zhubei or taichung LINE tokens", async () => {
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "zhubei-token");
    vi.stubEnv("LINE_CHANNEL_SECRET", "zhubei-secret");
    vi.stubEnv("LINE_TAICHUNG_CHANNEL_ACCESS_TOKEN", "taichung-token");
    vi.stubEnv("LINE_TAICHUNG_CHANNEL_SECRET", "taichung-secret");
    const fetchMock = mockLineOk();

    const result = await pushMessage("store-hsinchu", "U_customer", [
      { type: "text", text: "hello" },
    ]);

    expect(result).toEqual({
      success: false,
      error: LINE_TOKEN_NOT_CONFIGURED_ERROR,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getLineWebhookDiagnosticsForStore("store-hsinchu")).toEqual({
      storeSlug: "hsinchu",
      secretEnvName: "LINE_HSINCHU_CHANNEL_SECRET",
      hasSecret: false,
      secretLength: null,
      hasAccessToken: false,
    });
  });

  it("does not call LINE API when the store token is missing", async () => {
    const fetchMock = mockLineOk();

    const result = await pushMessage("store-taichung", "U_customer", [
      { type: "text", text: "hello" },
    ]);

    expect(result).toEqual({
      success: false,
      error: LINE_TOKEN_NOT_CONFIGURED_ERROR,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("verifyLineSignature uses the matching store secret", () => {
    const body = JSON.stringify({ destination: "D_taichung", events: [] });
    vi.stubEnv("LINE_CHANNEL_SECRET", "zhubei-secret");
    vi.stubEnv("LINE_TAICHUNG_CHANNEL_SECRET", "taichung-secret");
    const taichungSignature = crypto
      .createHmac("SHA256", "taichung-secret")
      .update(body)
      .digest("base64");
    const zhubeiSignature = crypto
      .createHmac("SHA256", "zhubei-secret")
      .update(body)
      .digest("base64");

    expect(verifyLineSignature("store-taichung", body, taichungSignature)).toBe(true);
    expect(verifyLineSignature("zhubei", body, zhubeiSignature)).toBe(true);
    expect(verifyLineSignature("zhubei", body, taichungSignature)).toBe(false);
    expect(verifyLineSignature("store-hsinchu", body, taichungSignature)).toBe(false);
  });

  it("verifyLineSignature uses hsinchu LINE_HSINCHU secret only", () => {
    const body = JSON.stringify({ destination: "D_hsinchu", events: [] });
    vi.stubEnv("LINE_CHANNEL_SECRET", "zhubei-secret");
    vi.stubEnv("LINE_TAICHUNG_CHANNEL_SECRET", "taichung-secret");
    vi.stubEnv("LINE_HSINCHU_CHANNEL_SECRET", "hsinchu-secret");
    const hsinchuSignature = crypto
      .createHmac("SHA256", "hsinchu-secret")
      .update(body)
      .digest("base64");
    const zhubeiSignature = crypto
      .createHmac("SHA256", "zhubei-secret")
      .update(body)
      .digest("base64");
    const taichungSignature = crypto
      .createHmac("SHA256", "taichung-secret")
      .update(body)
      .digest("base64");

    expect(verifyLineSignature("store-hsinchu", body, hsinchuSignature)).toBe(true);
    expect(verifyLineSignature("store-hsinchu", body, zhubeiSignature)).toBe(false);
    expect(verifyLineSignature("store-hsinchu", body, taichungSignature)).toBe(false);
  });

  it("trims store secrets before verifying signatures and reporting diagnostics", () => {
    const body = JSON.stringify({ destination: "D_taichung", events: [] });
    vi.stubEnv("LINE_TAICHUNG_CHANNEL_SECRET", "  taichung-secret\n");
    vi.stubEnv("LINE_TAICHUNG_CHANNEL_ACCESS_TOKEN", "\ttaichung-token ");
    const signature = crypto
      .createHmac("SHA256", "taichung-secret")
      .update(body)
      .digest("base64");

    expect(verifyLineSignature("store-taichung", body, signature)).toBe(true);
    expect(getLineWebhookDiagnosticsForStore("store-taichung")).toEqual({
      storeSlug: "taichung",
      secretEnvName: "LINE_TAICHUNG_CHANNEL_SECRET",
      hasSecret: true,
      secretLength: "taichung-secret".length,
      hasAccessToken: true,
    });
  });
});
