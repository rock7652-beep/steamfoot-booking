import { afterEach, describe, expect, it, vi } from "vitest";

const secretValues = {
  MESSENGER_APP_ID: "app-secret-value",
  MESSENGER_APP_ACCESS_TOKEN: "app-access-secret",
  MESSENGER_PAGE_ID_ZHUBEI: "536890669508668",
  MESSENGER_PAGE_ACCESS_TOKEN_ZHUBEI: "page-access-secret",
  MESSENGER_WEBHOOK_URL: "https://www.steamfoot.com/api/messenger/webhook",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

function configure() {
  for (const [key, value] of Object.entries(secretValues)) vi.stubEnv(key, value);
}

describe("Messenger production audit", () => {
  it("aggregates a successful read-only Graph audit without returning credentials", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ id: secretValues.MESSENGER_APP_ID }))
      .mockResolvedValueOnce(Response.json({ id: secretValues.MESSENGER_PAGE_ID_ZHUBEI }))
      .mockResolvedValueOnce(Response.json({ id: secretValues.MESSENGER_PAGE_ID_ZHUBEI }))
      .mockResolvedValueOnce(Response.json({ data: [{ object: "page", callback_url: secretValues.MESSENGER_WEBHOOK_URL, fields: ["messages", "messaging_postbacks", "messaging_optins", "messaging_referrals"] }] }))
      .mockResolvedValueOnce(Response.json({ data: [{ id: secretValues.MESSENGER_APP_ID }] })));
    const { runMessengerProductionAudit } = await import("@/lib/messenger-production-audit");
    const result = await runMessengerProductionAudit("zhubei");
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({ appValidated: true, pageTokenMatches: true, callbackMatches: true, pageAttached: true, missingFields: [] });
    expect(serialized).not.toContain(secretValues.MESSENGER_APP_ACCESS_TOKEN);
    expect(serialized).not.toContain(secretValues.MESSENGER_PAGE_ACCESS_TOKEN_ZHUBEI);
  });

  it("fails closed with safe status summaries when Graph fails", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("credential=must-not-leak", { status: 403 })));
    const { runMessengerProductionAudit } = await import("@/lib/messenger-production-audit");
    const result = await runMessengerProductionAudit("zhubei");

    expect(result.appValidated).toBe(false);
    expect(result.pageAttached).toBe(false);
    expect(result.calls.app).toEqual({ ok: false, httpStatus: 403, error: "http_error" });
    expect(JSON.stringify(result)).not.toContain("credential=must-not-leak");
  });

  it("hides a disabled audit and rejects missing or invalid tokens", async () => {
    vi.stubEnv("MESSENGER_AUDIT_ENABLED", "false");
    let route = await import("@/app/api/internal/messenger-production-audit/route");
    const disabled = await route.POST(new Request("https://test/api/internal/messenger-production-audit", { method: "POST" }));
    expect(disabled.status).toBe(404);
    expect(disabled.headers.get("cache-control")).toBe("no-store");

    vi.resetModules();
    vi.stubEnv("MESSENGER_AUDIT_ENABLED", "true");
    vi.stubEnv("MESSENGER_AUDIT_TOKEN", "audit-token-secret");
    route = await import("@/app/api/internal/messenger-production-audit/route");
    expect((await route.POST(new Request("https://test/api/internal/messenger-production-audit", { method: "POST" }))).status).toBe(401);
    expect((await route.POST(new Request("https://test/api/internal/messenger-production-audit", { method: "POST", headers: { Authorization: "Bearer wrong" } }))).status).toBe(401);
  });
});
