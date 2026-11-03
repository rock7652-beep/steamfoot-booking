import { beforeEach, describe, expect, it, vi } from "vitest";
import { isLineQuotaExceeded, quotaThreshold } from "@/lib/line-quota-policy";

const mocks = vi.hoisted(() => ({ blocked: vi.fn(() => false), send: vi.fn(), token: vi.fn(() => "fixture-token"), central: vi.fn(() => "fixture-central") }));
vi.mock("@/lib/runtime-env", () => ({ isPreviewExternalIntegrationBlocked: mocks.blocked }));
vi.mock("@/lib/line-config", () => ({ getLineAccessTokenForStore: mocks.token, getSteamButlerLineAccessToken: mocks.central }));
vi.mock("resend", () => ({ Resend: class { emails = { send: mocks.send }; } }));
import { readLineQuota } from "@/lib/line-quota";
import { notificationEmailReadiness, sendNotificationEmail } from "@/lib/notification-email";

beforeEach(() => {
  vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks();
  mocks.blocked.mockReturnValue(false); mocks.token.mockReturnValue("fixture-token");
});
describe("quota policy", () => {
  it.each([[79, null], [80, 80], [94, 80], [95, 95], [100, 100], [105, 100]])("usage %i uses highest threshold", (used, threshold) => {
    expect(quotaThreshold({ used, limit: 100 })).toBe(threshold);
  });
  it("handles unlimited and zero quotas", () => {
    expect(quotaThreshold({ used: 999, limit: null })).toBe(null);
    expect(quotaThreshold({ used: 0, limit: 0 })).toBe(100);
  });
  it("does not mistake rate limits for exhausted monthly quota", () => {
    expect(isLineQuotaExceeded('LINE API 429: {"message":"Too many requests"}')).toBe(false);
    expect(isLineQuotaExceeded('LINE API 429: {"message":"You have reached your monthly limit."}')).toBe(true);
    expect(isLineQuotaExceeded(null)).toBe(false);
  });
});
describe("quota lookup", () => {
  it("reads total monthly consumption without caching", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ type: "limited", value: 200 }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ totalUsage: 190 }) });
    vi.stubGlobal("fetch", fetcher);
    expect(await readLineQuota("store-a", "STORE")).toEqual({ used: 190, limit: 200 });
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("quota/consumption"), expect.objectContaining({ cache: "no-store" }));
    expect(mocks.token).toHaveBeenCalledWith("store-a");
  });
  it("rejects malformed upstream data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ type: "limited", value: -1, totalUsage: "0" }) }));
    await expect(readLineQuota("store-a", "STORE")).rejects.toThrow("格式");
  });
  it("blocks previews before touching external services", async () => {
    mocks.blocked.mockReturnValue(true);
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(readLineQuota("store-a", "CENTRAL")).rejects.toThrow("預覽");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
describe("strict notification email", () => {
  const input = { to: "fixture@example.com", subject: "測試", text: "測試內容", key: "event-fixture" };
  it("cannot count missing credentials as successful delivery", async () => {
    vi.stubEnv("RESEND_API_KEY", ""); vi.stubEnv("RESEND_FROM", "");
    expect(notificationEmailReadiness().configured).toBe(false);
    await expect(sendNotificationEmail(input)).rejects.toThrow("尚未設定");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("blocks preview even with credentials", async () => {
    vi.stubEnv("RESEND_API_KEY", "fixture"); vi.stubEnv("RESEND_FROM", "test@example.com"); mocks.blocked.mockReturnValue(true);
    await expect(sendNotificationEmail(input)).rejects.toThrow("預覽");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("uses Gmail as reply address and stable provider deduplication", async () => {
    vi.stubEnv("RESEND_API_KEY", "fixture"); vi.stubEnv("RESEND_FROM", "蒸管家 <test@example.com>");
    mocks.send.mockResolvedValue({ data: { id: "accepted-fixture" }, error: null });
    expect(await sendNotificationEmail(input)).toBe("accepted-fixture");
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ replyTo: "steambutler500@gmail.com", to: input.to }), { idempotencyKey: input.key });
  });
  it("fails when provider rejects the sender", async () => {
    vi.stubEnv("RESEND_API_KEY", "fixture"); vi.stubEnv("RESEND_FROM", "test@example.com");
    mocks.send.mockResolvedValue({ data: null, error: { message: "unverified" } });
    await expect(sendNotificationEmail(input)).rejects.toThrow("未接受");
  });
});
