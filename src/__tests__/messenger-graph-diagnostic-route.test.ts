import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
const mockResolveStore = vi.fn();
const mockDiagnose = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));
vi.mock("@/lib/store", () => ({ resolveAuthorizedConcreteStore: (...args: unknown[]) => mockResolveStore(...args) }));
vi.mock("@/server/services/messenger-graph-diagnostic", () => ({ diagnoseMessengerGraph: (...args: unknown[]) => mockDiagnose(...args) }));

const request = (storeId = "store-zhubei") => new Request("http://test/api/admin/messenger/graph-diagnostic", { method: "POST", body: JSON.stringify({ storeId }) });
beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "owner-1", role: "OWNER" } });
  mockResolveStore.mockResolvedValue({ id: "store-zhubei", slug: "zhubei" });
  mockDiagnose.mockResolvedValue({ classification: "NO_GRAPH_ERROR" });
});
afterEach(async () => { const { resetMessengerGraphDiagnosticRateLimitForTests } = await import("@/app/api/admin/messenger/graph-diagnostic/route"); resetMessengerGraphDiagnosticRateLimitForTests(); });

describe("Messenger Graph diagnostic API", () => {
  it("rejects unauthenticated, non-admin and cross-store calls", async () => {
    const { POST } = await import("@/app/api/admin/messenger/graph-diagnostic/route");
    mockAuth.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(401);
    mockAuth.mockResolvedValueOnce({ user: { id: "staff-1", role: "PARTNER" } });
    expect((await POST(request())).status).toBe(403);
    mockResolveStore.mockResolvedValueOnce({ id: "store-other", slug: "other" });
    expect((await POST(request("store-other"))).status).toBe(403);
    expect(mockDiagnose).not.toHaveBeenCalled();
  });

  it("runs the safe service only for the authorized Zhubei store", async () => {
    const { POST } = await import("@/app/api/admin/messenger/graph-diagnostic/route");
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mockDiagnose).toHaveBeenCalledWith({ actorUserId: "owner-1", storeId: "store-zhubei" });
  });
});
