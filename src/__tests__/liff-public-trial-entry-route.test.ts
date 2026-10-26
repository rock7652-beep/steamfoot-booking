import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  resolveStore: vi.fn(),
  probe: vi.fn(),
  createLink: vi.fn(),
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

    expect(response.status).toBe(400);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
});
