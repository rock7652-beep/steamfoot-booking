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
    ["e182e256-98ca-4c78-970b-d4b118066c51", "LINE_ZHUBEI_CHANNEL_ACCESS_TOKEN", "zhubei-token"],
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

  it("does not call LINE API when the store token is missing", async () => {
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

  it("verifyLineSignature uses the matching store secret", () => {
    const body = JSON.stringify({ destination: "D_hsinchu", events: [] });
    vi.stubEnv("LINE_HSINCHU_CHANNEL_SECRET", "hsinchu-secret");
    vi.stubEnv("LINE_ZHUBEI_CHANNEL_SECRET", "zhubei-secret");
    const signature = crypto
      .createHmac("SHA256", "hsinchu-secret")
      .update(body)
      .digest("base64");

    expect(verifyLineSignature("store-hsinchu", body, signature)).toBe(true);
    expect(verifyLineSignature("zhubei", body, signature)).toBe(false);
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
