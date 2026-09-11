import { afterEach, describe, expect, it, vi } from "vitest";

const originalVercelEnv = process.env.VERCEL_ENV;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  process.env.VERCEL_ENV = originalVercelEnv;
});

describe("Preview external integration isolation", () => {
  it("blocks only Vercel Preview and leaves production available", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.resetModules();
    const { isPreviewExternalIntegrationBlocked } = await import("@/lib/runtime-env");
    expect(isPreviewExternalIntegrationBlocked()).toBe(true);

    vi.stubEnv("VERCEL_ENV", "production");
    expect(isPreviewExternalIntegrationBlocked()).toBe(false);
  });

  it("does not invoke LINE, Messenger, or HealthFlow from Preview", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("STEAM_BUTLER_LINE_CHANNEL_ACCESS_TOKEN", "preview-test-token");
    vi.stubEnv("HEALTH_API_URL", "https://healthflow.example.test");
    vi.stubEnv("HEALTH_API_KEY", "preview-test-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();

    const { pushSteamButlerMessage } = await import("@/lib/line");
    const { sendMessengerMessages } = await import("@/lib/messenger");
    const { lookupHealthProfile } = await import("@/lib/health-service");

    await expect(pushSteamButlerMessage("U-preview-test", [{ type: "text", text: "test" }]))
      .resolves.toMatchObject({ success: false, errorType: "preview_blocked" });
    await expect(sendMessengerMessages({
      pageId: "preview-page",
      pageAccessToken: "preview-token",
      recipientId: "preview-recipient",
      messages: [{ text: "test" }],
    })).resolves.toMatchObject({ success: false });
    await expect(lookupHealthProfile(undefined, "0911000000"))
      .rejects.toThrow("Preview HealthFlow lookup is blocked");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("guards every configured external sender before its network call", async () => {
    const sources = await Promise.all([
      import("node:fs/promises").then((fs) => fs.readFile("src/lib/line.ts", "utf8")),
      import("node:fs/promises").then((fs) => fs.readFile("src/lib/messenger.ts", "utf8")),
      import("node:fs/promises").then((fs) => fs.readFile("src/lib/email.ts", "utf8")),
    ]);
    for (const source of sources) {
      expect(source).toContain("isPreviewExternalIntegrationBlocked");
    }
  });
});
