import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
const mockResolveStore = vi.fn();
const mockDiagnose = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));
vi.mock("@/lib/store", () => ({ resolveAuthorizedConcreteStore: (...args: unknown[]) => mockResolveStore(...args) }));
vi.mock("@/server/services/messenger-token-fingerprint", () => ({ diagnoseMessengerPageToken: (...args: unknown[]) => mockDiagnose(...args), getTokenFormat: () => ({}) }));

const localFormat = { tokenLength: 12, hasWrappingQuotes: false, hasNewline: false, trimChangesLength: false };
const request = (body: unknown) => new Request("http://test/api/admin/messenger/token-fingerprint", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "owner-1", role: "OWNER" } });
  mockResolveStore.mockResolvedValue({ id: "store-zhubei", slug: "zhubei" });
  mockDiagnose.mockResolvedValue({ fingerprintsMatch: true });
});
afterEach(async () => { const { resetMessengerTokenFingerprintRateLimitForTests } = await import("@/app/api/admin/messenger/token-fingerprint/route"); resetMessengerTokenFingerprintRateLimitForTests(); });

describe("Messenger token fingerprint admin API", () => {
  it("rejects unauthenticated, unauthorized and malformed requests", async () => {
    const { POST } = await import("@/app/api/admin/messenger/token-fingerprint/route");
    mockAuth.mockResolvedValueOnce(null);
    expect((await POST(request({}))).status).toBe(401);
    mockAuth.mockResolvedValueOnce({ user: { id: "staff-1", role: "PARTNER" } });
    expect((await POST(request({}))).status).toBe(403);
    expect((await POST(request({ storeId: "store-zhubei", localFingerprint: "not-a-fingerprint", localFormat }))).status).toBe(400);
    expect(mockDiagnose).not.toHaveBeenCalled();
  });

  it("sends only local fingerprint and format, with no-store caching", async () => {
    const { POST } = await import("@/app/api/admin/messenger/token-fingerprint/route");
    const response = await POST(request({ storeId: "store-zhubei", localFingerprint: "0123456789ab", localFormat }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mockDiagnose).toHaveBeenCalledWith({ actorUserId: "owner-1", storeId: "store-zhubei", localFingerprint: "0123456789ab", localFormat });
  });
});
