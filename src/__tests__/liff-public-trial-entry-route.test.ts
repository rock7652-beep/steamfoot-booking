import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  resolveStore: vi.fn(),
  probe: vi.fn(),
  createLink: vi.fn(),
  module: vi.fn(),
}));

vi.mock("@/lib/liff/verify-id-token", () => ({
  LiffIdTokenError: class LiffIdTokenError extends Error {
    constructor(public code: string, message: string) {
      super(message);
    }
  },
  verifyLiffIdToken: (...args: unknown[]) => mocks.verify(...args),
}));
vi.mock("@/lib/store-resolver", () => ({
  resolveStoreBySlug: (...args: unknown[]) => mocks.resolveStore(...args),
}));
vi.mock("@/lib/line", () => ({
  probeStoreLineRecipient: (...args: unknown[]) => mocks.probe(...args),
}));
vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule: mocks.module }));
vi.mock("@/server/services/trial-booking-chat-link", () => ({
  createTrialBookingChatLink: (...args: unknown[]) => mocks.createLink(...args),
}));

import { POST } from "@/app/api/liff/public-trial-entry/route";

function request(body: unknown) {
  return new Request("https://example.test/api/liff/public-trial-entry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STORE_LINE_CONFIG_JSON", "");
  vi.stubEnv("STORE_LINE_ADDITIONAL_CONFIG_JSON", "");
  mocks.module.mockResolvedValue("beauty");
  mocks.verify.mockResolvedValue({
    lineUserId: "Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    channelId: "2010761154",
    displayName: "王小美",
    pictureUrl: null,
    expiresAt: 2_000_000_000,
  });
  mocks.resolveStore.mockResolvedValue({ id: "store-zhubei", slug: "zhubei" });
  mocks.probe.mockResolvedValue({ status: "COMPATIBLE" });
  mocks.createLink.mockResolvedValue({
    url: "https://www.steamfoot.com/pricing/experience/zhubei/book?entry=link-id.secret",
    expiresAt: new Date("2026-08-17T11:30:00.000Z"),
  });
});
afterEach(() => vi.unstubAllEnvs());

const configured = { storeId: "store-soulife", slug: "soulife", providerId: "901", loginChannelId: "902", messagingProviderId: "901", messagingChannelId: "903", liffId: "902-beauty", basicId: "@beauty", destination: "U" + "a".repeat(32), accessTokenEnv: "TEST_TOKEN", channelSecretEnv: "TEST_SECRET" };

it("uses the configured beauty audience and issues only its own store entry", async () => {
  vi.stubEnv("STORE_LINE_CONFIG_JSON", JSON.stringify([configured]));
  mocks.resolveStore.mockResolvedValue({ id: "store-soulife", slug: "soulife" });
  const response = await POST(request({ idToken: "token", storeSlug: "soulife" }));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(mocks.verify).toHaveBeenCalledWith("token", "902");
  expect(mocks.probe).toHaveBeenCalledWith("store-soulife", "Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  expect(mocks.createLink).toHaveBeenCalledWith({
    storeId: "store-soulife", channel: "LINE", chatIdentity: "Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  });
});
it.each([["INCOMPATIBLE", 409], ["UNAVAILABLE", 503]])("retains beauty verification failure %s", async (status, code) => {
  vi.stubEnv("STORE_LINE_CONFIG_JSON", JSON.stringify([configured]));
  mocks.resolveStore.mockResolvedValue({ id: "store-soulife", slug: "soulife" });
  mocks.probe.mockResolvedValue({ status });
  expect((await POST(request({ idToken: "token", storeSlug: "soulife" }))).status).toBe(code);
  expect(mocks.createLink).not.toHaveBeenCalled();
});
it.each(["wrong-store", "course"])("rejects configured %s before probing or minting", async kind => {
  vi.stubEnv("STORE_LINE_CONFIG_JSON", JSON.stringify([configured]));
  mocks.resolveStore.mockResolvedValue({ id: kind === "wrong-store" ? "other" : "store-soulife", slug: "soulife" });
  mocks.module.mockResolvedValue(kind === "course" ? "course" : "beauty");
  expect((await POST(request({ idToken: "token", storeSlug: "soulife" }))).status).toBe(404);
  expect(mocks.probe).not.toHaveBeenCalled(); expect(mocks.createLink).not.toHaveBeenCalled();
});

describe("POST /api/liff/public-trial-entry", () => {
  it("preserves verified Login proof and independently verified notification reachability", async () => {
    const response = await POST(request({
      idToken: "verified-liff-token",
      storeSlug: "zhubei",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      entry: "link-id.secret",
    });
    expect(mocks.verify).toHaveBeenCalledWith(
      "verified-liff-token",
      "2010761154",
    );
    expect(mocks.probe).toHaveBeenCalledWith(
      "store-zhubei",
      "Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(mocks.createLink).toHaveBeenCalledWith({
      storeId: "store-zhubei",
      channel: "LINE",
      chatIdentity: "Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      verifiedLogin: { channelId: "2010761154", lineUserId: "Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      notificationVerified: true,
    });
  });

  it.each(["INCOMPATIBLE", "UNAVAILABLE"])("preserves Login when notification reachability is %s", async status => {
    mocks.probe.mockResolvedValue({ status });
    const response = await POST(request({ idToken: "verified-liff-token", storeSlug: "zhubei" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", entry: "link-id.secret" });
    expect(mocks.createLink).toHaveBeenCalledWith(expect.objectContaining({
      verifiedLogin: { channelId: "2010761154", lineUserId: "Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      notificationVerified: false,
    }));
  });

  it.each(["hsinchu", "taichung"])(
    "accepts the enabled %s store with the shared LINE Login channel",
    async (storeSlug) => {
      const response = await POST(request({
        idToken: "verified-liff-token",
        storeSlug,
      }));

      expect(response.status).toBe(200);
      expect(mocks.verify).toHaveBeenCalledWith(
        "verified-liff-token",
        "2010761154",
      );
    },
  );

  it("does not accept an unknown store slug", async () => {
    const response = await POST(request({
      idToken: "verified-liff-token",
      storeSlug: "unknown-store",
    }));

    expect(response.status).toBe(404);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
});
