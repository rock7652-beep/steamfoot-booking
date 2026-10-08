import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({ send: vi.fn(), construct: vi.fn(), find: vi.fn(), fetch: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: transport.send };
    constructor(key: string) { transport.construct(key); }
  },
}));
vi.mock("@/lib/db", () => ({ prisma: { trialApplication: { findUniqueOrThrow: transport.find } } }));
import { emptyTrialApplication } from "@/lib/trial-application";
import { notifyTrialApplication } from "@/server/services/trial-application-notification";

const id = "d5e15c3e-0512-4c14-ad98-04fe7ce5b44a";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("TRIAL_INTAKE_WEBHOOK_URL", "");
  vi.stubEnv("TRIAL_INTAKE_WEBHOOK_SECRET", "");
  vi.stubGlobal("fetch", transport.fetch);
  transport.find.mockResolvedValue({ id, revision: 1, status: "RECEIVED", createdAt: new Date("2026-10-02T02:00:00Z"), updatedAt: new Date("2026-10-02T02:00:00Z"), payload: { ...emptyTrialApplication, storeName: "通知測試教室", contactName: "測試", phone: "0000000000", email: "test@example.invalid", inviteUrl: "https://manager.line.biz/secret-invitation" } });
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("RESEND_API_KEY", "test-only-not-a-real-key");
  vi.stubEnv("RESEND_FROM", "蒸管家 <noreply@steamfoot.tw>");
  vi.stubEnv("NEXTAUTH_URL", "https://www.steamfoot.com/");
  transport.send.mockResolvedValue({ data: { id: "mail-id" }, error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

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
    expect(message.to).toBe("steambutler500@gmail.com");
    expect(message.subject).toContain("通知測試教室");
    expect(message.text).toContain("電話：0000000000");
    expect(message.text).toContain("test@example.invalid");
    expect(message.text).toContain(`https://www.steamfoot.com/hq/dashboard/trial-applications?application=${id}`);
    expect(message.text).toContain("待補資料");
    expect(message.text).not.toMatch(/Developers|Provider Admin|Messaging API Admin|LINE Login Admin/);
    expect(message.text).not.toMatch(/token|secret|manager\.line\.biz/i);
  });
  it("does not turn historical authorization answers into missing requirements", async () => {
    const record = await transport.find();
    transport.find.mockResolvedValue({ ...record, payload: { ...record.payload, developers: "invited", providerAdmin: "invited", messagingAdmin: "absent", loginAdmin: "help" } });
    expect(await notifyTrialApplication(id)).toBe("SENT");
    expect(transport.send.mock.calls[0][0].text).not.toMatch(/Developers|Provider Admin|Messaging API Admin|LINE Login Admin/);
    expect(transport.send.mock.calls[0][0].text).toContain("官方 LINE 管理員邀請：已提供，待確認");
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

describe("Google intake webhook", () => {
  beforeEach(() => {
    vi.stubEnv("TRIAL_INTAKE_WEBHOOK_URL", "https://script.google.com/macros/s/test-deployment/exec");
    vi.stubEnv("TRIAL_INTAKE_WEBHOOK_SECRET", "s".repeat(64));
    transport.fetch.mockResolvedValue({ok:true,json:async () => ({ok:true,id,revision:1,sheet:"SAVED",mail:"SENT"})});
  });
  it("requires both matching sheet receipt and mail acknowledgement", async () => {
    expect(await notifyTrialApplication(id)).toBe("SENT");
    const body = JSON.parse(transport.fetch.mock.calls[0][1].body);
    expect(body.application.storeName).toBe("通知測試教室");
    expect(body.application.missing).not.toMatch(/Developers|Provider Admin|Messaging API Admin|LINE Login Admin/);
    expect(body.application).not.toHaveProperty("inviteUrl");
    expect(body.application).not.toHaveProperty("resumeTokenHash");
    expect(transport.send).not.toHaveBeenCalled();
  });
  it("does not fall back and double-send after partial Google failure", async () => {
    transport.fetch.mockResolvedValue({ok:true,json:async () => ({ok:false,sheet:"SAVED",mail:"FAILED"})});
    expect(await notifyTrialApplication(id)).toBe("FAILED");
    expect(transport.send).not.toHaveBeenCalled();
  });
  it("rejects mismatched acknowledgement", async () => {
    transport.fetch.mockResolvedValue({ok:true,json:async () => ({ok:true,id,revision:9,sheet:"SAVED",mail:"SENT"})});
    expect(await notifyTrialApplication(id)).toBe("FAILED");
  });
  it("blocks Preview sheet writes as well as mail", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(await notifyTrialApplication(id)).toBe("DISABLED");
    expect(transport.fetch).not.toHaveBeenCalled();
  });
  it.each(["https://example.com/exec", "https://script.google.com/macros/s/x/exec?secret=x"]) ("rejects unsafe endpoints", async (url) => {
    vi.stubEnv("TRIAL_INTAKE_WEBHOOK_URL", url);
    expect(await notifyTrialApplication(id)).toBe("FAILED");
    expect(transport.fetch).not.toHaveBeenCalled();
  });
  it("uses a supplement subject for later revisions", async () => {
    vi.stubEnv("TRIAL_INTAKE_WEBHOOK_URL", "");
    const record = await transport.find();
    transport.find.mockResolvedValue({...record,revision:2});
    expect(await notifyTrialApplication(id)).toBe("SENT");
    expect(transport.send.mock.calls[0][0].subject).toContain("補件通知");
  });
});
