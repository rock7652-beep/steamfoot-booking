import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
const mockResolveStore = vi.fn();
const mockCreateRun = vi.fn();
const mockFindRun = vi.fn();

vi.mock("@/lib/auth", () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));
vi.mock("@/lib/store", () => ({ resolveAuthorizedConcreteStore: (...args: unknown[]) => mockResolveStore(...args) }));
vi.mock("@/server/services/messenger-production-audit", () => ({ createMessengerAuditRun: (...args: unknown[]) => mockCreateRun(...args) }));
vi.mock("@/lib/db", () => ({ prisma: { messengerAuditRun: { findUnique: (...args: unknown[]) => mockFindRun(...args) } } }));

function owner(overrides: Record<string, unknown> = {}) {
  return { id: "owner-1", role: "OWNER", staffId: "staff-1", storeId: "store-zhubei", ...overrides };
}

function auditRun(overrides: Record<string, unknown> = {}) {
  return {
    id: "audit-1", storeId: "store-zhubei", requestedByUserId: "owner-1",
    createdAt: new Date("2026-07-29T00:00:00.000Z"), completedAt: new Date("2026-07-29T00:00:01.000Z"),
    status: "COMPLETED", appValidated: true, pageTokenMatches: true, callbackMatches: true,
    configuredFields: ["messages"], missingFields: [], pageAttached: true,
    callsSafeSummary: { app: { ok: true, httpStatus: 200, error: null } }, errorCode: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: owner() });
  mockResolveStore.mockResolvedValue({ id: "store-zhubei", slug: "zhubei", name: "竹北店" });
  mockCreateRun.mockResolvedValue(auditRun());
  mockFindRun.mockResolvedValue(auditRun());
});

afterEach(async () => {
  const { resetMessengerAuditRateLimitForTests } = await import("@/app/api/admin/messenger/audit/route");
  resetMessengerAuditRateLimitForTests();
});

describe("Messenger audit admin API", () => {
  it("rejects unauthenticated and non-owner requests", async () => {
    const { POST } = await import("@/app/api/admin/messenger/audit/route");
    mockAuth.mockResolvedValueOnce(null);
    expect((await POST(new Request("http://test/api/admin/messenger/audit", { method: "POST", body: JSON.stringify({ storeId: "store-zhubei" }) }))).status).toBe(401);

    mockAuth.mockResolvedValueOnce({ user: owner({ role: "PARTNER" }) });
    expect((await POST(new Request("http://test/api/admin/messenger/audit", { method: "POST", body: JSON.stringify({ storeId: "store-zhubei" }) }))).status).toBe(403);
    expect(mockCreateRun).not.toHaveBeenCalled();
  });

  it("rejects cross-store requests before running the audit", async () => {
    const { POST } = await import("@/app/api/admin/messenger/audit/route");
    mockResolveStore.mockRejectedValueOnce(new Error("cross-store"));

    const response = await POST(new Request("http://test/api/admin/messenger/audit", { method: "POST", body: JSON.stringify({ storeId: "other-store" }) }));
    expect(response.status).toBe(403);
    expect(mockCreateRun).not.toHaveBeenCalled();
  });

  it("creates a store-scoped audit run and returns only its id", async () => {
    const { POST } = await import("@/app/api/admin/messenger/audit/route");
    const response = await POST(new Request("http://test/api/admin/messenger/audit", { method: "POST", body: JSON.stringify({ storeId: "store-zhubei" }) }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ auditRunId: "audit-1" });
    expect(mockCreateRun).toHaveBeenCalledWith({ storeId: "store-zhubei", storeSlug: "zhubei", requestedByUserId: "owner-1" });
  });

  it("rate limits repeated audit requests for the same owner and store", async () => {
    const { POST } = await import("@/app/api/admin/messenger/audit/route");
    const request = () => new Request("http://test/api/admin/messenger/audit", {
      method: "POST", body: JSON.stringify({ storeId: "store-zhubei" }),
    });

    expect((await POST(request())).status).toBe(200);
    expect((await POST(request())).status).toBe(429);
    expect(mockCreateRun).toHaveBeenCalledTimes(1);
  });

  it("does not expose a saved audit run across stores", async () => {
    const { GET } = await import("@/app/api/admin/messenger/audit/[id]/route");
    mockResolveStore.mockRejectedValueOnce(new Error("cross-store"));

    const response = await GET(new Request("http://test/api/admin/messenger/audit/audit-1"), { params: Promise.resolve({ id: "audit-1" }) });
    expect(response.status).toBe(403);
  });

  it("returns only safe saved fields", async () => {
    const { GET } = await import("@/app/api/admin/messenger/audit/[id]/route");
    const response = await GET(new Request("http://test/api/admin/messenger/audit/audit-1"), { params: Promise.resolve({ id: "audit-1" }) });
    const body = await response.json();

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({ id: "audit-1", appValidated: true, callsSafeSummary: { app: { httpStatus: 200 } } });
    expect(JSON.stringify(body)).not.toContain("token");
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});
