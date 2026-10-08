// URL-only synthetic scope. Senders are mocked; no database or network access.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MUSIC_OPENING_BRANCH } from "../../scripts/music-opening-preview-scope.mjs";
const mocks = vi.hoisted(() => ({ resend: vi.fn(), sendMail: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { emails = { send: mocks.sendMail }; constructor() { mocks.resend(); } } }));
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  for (const [key, value] of Object.entries({ VERCEL: "1", VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: MUSIC_OPENING_BRANCH, VERCEL_GIT_REPO_OWNER: "rock7652-beep",
    VERCEL_GIT_REPO_SLUG: "steamfoot-booking", WORKERS_CI_BRANCH: "", CF_PAGES_BRANCH: "",
    RESEND_API_KEY: "", STEAM_BUTLER_LINE_CHANNEL_ACCESS_TOKEN: "", NEXTAUTH_URL: "https://music-qa.example.invalid",
    VERCEL_URL: "music-qa.example.invalid", COURSE_LINE_ACCEPTANCE_JSON: "{}" })) vi.stubEnv(key, value);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it.each(["preview", "production", "development", undefined])("never permits music external senders with environment %s", async (environment) => {
  vi.stubEnv("VERCEL_ENV", environment);
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const { isPreviewExternalIntegrationBlocked } = await import("@/lib/runtime-env");
  const { pushSteamButlerMessage } = await import("@/lib/line");
  const { sendMessengerMessages } = await import("@/lib/messenger");
  const { sendActivationEmail } = await import("@/lib/email");
  const { readPreviewLineAcceptance } = await import("@/lib/preview-line-acceptance");
  expect(isPreviewExternalIntegrationBlocked()).toBe(true);
  expect(readPreviewLineAcceptance()).toBeNull();
  await expect(pushSteamButlerMessage("synthetic-recipient", [{ type: "text", text: "Synthetic" }])).resolves.toMatchObject({ success: false, errorType: "preview_blocked" });
  await expect(sendMessengerMessages({ pageId: "synthetic-page", pageAccessToken: "", recipientId: "synthetic-recipient", messages: [{ text: "Synthetic" }] })).resolves.toMatchObject({ success: false, error: "Preview outbound Messenger delivery is blocked" });
  await sendActivationEmail("music-qa@example.invalid", "", "Synthetic");
  expect(info).toHaveBeenCalledWith("[Email] Preview outbound delivery blocked");
  expect(fetch).not.toHaveBeenCalled();
  expect(mocks.resend).not.toHaveBeenCalled();
  expect(mocks.sendMail).not.toHaveBeenCalled();
});
