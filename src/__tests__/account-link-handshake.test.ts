import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  issueAccountLinkHandshake,
  verifyAccountLinkHandshake,
} from "@/lib/account-link-handshake";

describe("account link handshake", () => {
  beforeEach(() => {
    vi.stubEnv("NEXTAUTH_SECRET", "account-link-test-secret-at-least-32-chars");
    vi.useRealTimers();
  });

  it("binds the signed handshake to one user and provider", async () => {
    const token = await issueAccountLinkHandshake({
      userId: "customer-user-1",
      provider: "google",
    });

    const verified = await verifyAccountLinkHandshake(token, "google");
    expect(verified).toEqual(
      expect.objectContaining({
        userId: "customer-user-1",
        provider: "google",
      }),
    );
    await expect(verifyAccountLinkHandshake(token, "line")).resolves.toBeNull();
  });

  it("rejects tampering and expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T00:00:00Z"));
    const token = await issueAccountLinkHandshake({
      userId: "customer-user-1",
      provider: "line",
    });

    await expect(
      verifyAccountLinkHandshake(`${token.slice(0, -1)}x`, "line"),
    ).resolves.toBeNull();
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    await expect(verifyAccountLinkHandshake(token, "line")).resolves.toBeNull();
  });
});
