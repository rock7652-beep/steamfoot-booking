import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

describe("Messenger App Access Token", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it("derives the standard App ID|App Secret token and only exposes safe metadata", async () => {
    vi.stubEnv("MESSENGER_APP_ID", "1019175470965183");
    vi.stubEnv("MESSENGER_APP_SECRET", "secret-never-leak");
    vi.stubEnv("MESSENGER_APP_ACCESS_TOKEN", "stale-token-never-leak");
    const { getMessengerAppAccessTokenInfo } = await import("@/lib/messenger-config");
    const info = getMessengerAppAccessTokenInfo();

    expect(info).toMatchObject({ source: "derived_from_app_secret", hasAppIdPrefix: true, hasSingleDelimiter: true, hasWrappingQuotes: false, hasNewline: false, trimChangesLength: false });
    expect(info?.fingerprint).toHaveLength(12);
    expect(JSON.stringify(info)).not.toContain("secret-never-leak");
    expect(JSON.stringify(info)).not.toContain("stale-token-never-leak");
  });

  it("uses the configured token only when App Secret is unavailable", async () => {
    vi.stubEnv("MESSENGER_APP_ID", "1019175470965183");
    vi.stubEnv("MESSENGER_APP_ACCESS_TOKEN", "configured-token");
    const { getMessengerAppAccessTokenInfo } = await import("@/lib/messenger-config");
    expect(getMessengerAppAccessTokenInfo()).toMatchObject({ source: "configured_fallback", hasAppIdPrefix: false, hasSingleDelimiter: false });
  });
});
