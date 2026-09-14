import { beforeEach, describe, expect, it, vi } from "vitest";

const storeFindUnique = vi.fn();
const attemptCreate = vi.fn();
const attemptUpdate = vi.fn();
const attemptUpdateMany = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    store: { findUnique: (...args: unknown[]) => storeFindUnique(...args) },
    lineOAuthAttempt: {
      create: (...args: unknown[]) => attemptCreate(...args),
      update: (...args: unknown[]) => attemptUpdate(...args),
      updateMany: (...args: unknown[]) => attemptUpdateMany(...args),
    },
  },
}));

describe("mobile LINE OAuth coordinator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("LINE_OAUTH_STORE_CONTEXT_SECRET", "test-context-secret");
    vi.stubEnv("WEB_LINE_LOGIN_CHANNEL_ID", "web-channel");
    vi.stubEnv("WEB_LINE_LOGIN_CHANNEL_SECRET", "web-secret");
    storeFindUnique.mockResolvedValue({ id: "store-spa", slug: "spa-test" });
    attemptCreate.mockResolvedValue({ id: "attempt-1" });
    attemptUpdate.mockResolvedValue({ id: "attempt-1" });
    attemptUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("stores a hashed attempt and carries the exact store return path in signed state", async () => {
    const { createMobileAuthorization, verifyMobileCoordinatorState } = await import(
      "@/lib/line-oauth/mobile-coordinator"
    );
    const authorization = await createMobileAuthorization({
      callbackUrl: "https://preview.example/api/auth/callback/line",
      storeSlug: "spa-test",
      returnPath: "/s/spa-test/liff/spa-work",
    });
    const url = new URL(authorization);
    const state = url.searchParams.get("state");

    expect(state).toMatch(/^wm1\./);
    expect(verifyMobileCoordinatorState(state!)).toMatchObject({
      attemptId: "attempt-1",
      storeId: "store-spa",
      storeSlug: "spa-test",
      returnPath: "/s/spa-test/liff/spa-work",
    });
    expect(attemptUpdate).toHaveBeenCalledWith({
      where: { id: "attempt-1" },
      data: { stateHash: expect.stringMatching(/^[a-f0-9]{64}$/) },
    });
  });

  it("rejects a return path outside the exact member/work allowlist before writing", async () => {
    const { createMobileAuthorization } = await import(
      "@/lib/line-oauth/mobile-coordinator"
    );
    await expect(createMobileAuthorization({
      callbackUrl: "https://preview.example/api/auth/callback/line",
      storeSlug: "spa-test",
      returnPath: "https://attacker.example/",
    })).rejects.toThrow("Invalid LINE OAuth return path");
    expect(attemptCreate).not.toHaveBeenCalled();
  });

  it("consumes the DB-backed state without relying on a browser cookie", async () => {
    const { createMobileAuthorization, consumeMobileCallback } = await import(
      "@/lib/line-oauth/mobile-coordinator"
    );
    const authorization = await createMobileAuthorization({
      callbackUrl: "https://preview.example/api/auth/callback/line",
      storeSlug: "spa-test",
      returnPath: "/s/spa-test/book",
    });
    const state = new URL(authorization).searchParams.get("state")!;
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ access_token: "access-token" }))
      .mockResolvedValueOnce(Response.json({ userId: "line-user", displayName: "LINE User" })));

    await expect(consumeMobileCallback({
      state,
      code: "authorization-code",
      callbackUrl: "https://preview.example/api/auth/callback/line",
    })).resolves.toMatchObject({
      attemptId: "attempt-1",
      storeId: "store-spa",
      storeSlug: "spa-test",
      returnPath: "/s/spa-test/book",
      profile: { userId: "line-user" },
    });
    expect(attemptUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "attempt-1",
        storeId: "store-spa",
        storeSlug: "spa-test",
        channelKey: "web-mobile",
        status: "PENDING",
        consumedAt: null,
      }),
      data: expect.objectContaining({ status: "CONSUMED" }),
    }));
  });
});
