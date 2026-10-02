import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({ send: vi.fn(), construct: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: transport.send };
    constructor(key: string) { transport.construct(key); }
  },
}));
import { notifyTrialApplication } from "@/server/services/trial-application-notification";

const id = "d5e15c3e-0512-4c14-ad98-04fe7ce5b44a";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("RESEND_API_KEY", "test-only-not-a-real-key");
  vi.stubEnv("RESEND_FROM", "蒸管家 <noreply@steamfoot.tw>");
  vi.stubEnv("NEXTAUTH_URL", "https://www.steamfoot.com/");
  transport.send.mockResolvedValue({ data: { id: "mail-id" }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("trial notification delivery boundary", () => {
  it("never sends from Preview even when a key is present", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(await notifyTrialApplication(id)).toBe("DISABLED");
    expect(transport.construct).not.toHaveBeenCalled();
    expect(transport.send).not.toHaveBeenCalled();
  });
  it("does not attempt delivery without a key", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect(await notifyTrialApplication(id)).toBe("DISABLED");
    expect(transport.send).not.toHaveBeenCalled();
  });
  it("sends only to the work mailbox with the canonical HQ link", async () => {
    expect(await notifyTrialApplication(id)).toBe("SENT");
    const message = transport.send.mock.calls[0][0];
    expect(message).toEqual({
      from: "蒸管家 <noreply@steamfoot.tw>",
      to: "rock7652@gmail.com",
      subject: "蒸管家｜新的體驗版申請",
      text: `收到新的體驗版申請。請登入總部查看：https://www.steamfoot.com/hq/dashboard/trial-applications?application=${id}`,
    });
    expect(message.text).not.toMatch(/token|secret|manager\.line\.biz/i);
  });
  it("records an API rejection as failed delivery", async () => {
    transport.send.mockResolvedValue({ data: null, error: { name: "validation_error" } });
    expect(await notifyTrialApplication(id)).toBe("FAILED");
  });
  it("records a transport failure without leaking it to the applicant", async () => {
    transport.send.mockRejectedValue(new Error("transport failed"));
    expect(await notifyTrialApplication(id)).toBe("FAILED");
  });
  it("does not send a broken HQ link when the production URL is absent", async () => {
    vi.stubEnv("NEXTAUTH_URL", "");
    expect(await notifyTrialApplication(id)).toBe("FAILED");
    expect(transport.send).not.toHaveBeenCalled();
  });
});
