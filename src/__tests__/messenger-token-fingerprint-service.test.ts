import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mockAuditCreate = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: { auditLog: { create: (...args: unknown[]) => mockAuditCreate(...args) } } }));

describe("Messenger token fingerprint diagnostic", () => {
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

  it("returns only fingerprints, format and redacted Graph errors", async () => {
    const token = "EA-secret-token";
    vi.stubEnv("MESSENGER_PAGE_ACCESS_TOKEN_ZHUBEI", token);
    mockAuditCreate.mockResolvedValue({ id: "audit-1" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { type: "OAuthException", code: 190, error_subcode: 463, fbtrace_id: "trace-1", message: `Token ${token} for 536890669508668 at https://example.test` } }), { status: 400 })));
    const { diagnoseMessengerPageToken, getTokenFormat } = await import("@/server/services/messenger-token-fingerprint");
    const result = await diagnoseMessengerPageToken({ actorUserId: "owner-1", storeId: "store-zhubei", localFingerprint: "0123456789ab", localFormat: getTokenFormat("local-token") });

    expect(result.runtime.fingerprint).toHaveLength(12);
    expect(result).toMatchObject({ fingerprintsMatch: false, graphChecks: { me: { httpStatus: 400, error: { type: "OAuthException", code: 190, subcode: 463, fbtraceId: "trace-1" } } } });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.stringify(result)).not.toContain("536890669508668");
    expect(JSON.stringify(result)).not.toContain("https://example.test");
    expect(JSON.stringify(mockAuditCreate.mock.calls)).not.toContain(token);
    expect(JSON.stringify(mockAuditCreate.mock.calls)).not.toContain(result.runtime.fingerprint);
  });

  it("detects quotes, newlines and trim changes without exposing content", async () => {
    const { getTokenFormat } = await import("@/server/services/messenger-token-fingerprint");
    expect(getTokenFormat('" token\\n"')).toEqual({ tokenLength: 10, hasWrappingQuotes: true, hasNewline: false, trimChangesLength: false });
    expect(getTokenFormat(" token\n")).toMatchObject({ hasNewline: true, trimChangesLength: true });
  });
});
