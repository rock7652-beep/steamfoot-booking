import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
const mockResolveStore = vi.fn();
const mockRepair = vi.fn();

vi.mock("@/lib/auth", () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));
vi.mock("@/lib/store", () => ({ resolveAuthorizedConcreteStore: (...args: unknown[]) => mockResolveStore(...args) }));
vi.mock("@/server/services/messenger-page-repair", () => ({ repairMessengerPageBinding: (...args: unknown[]) => mockRepair(...args) }));

function owner(overrides: Record<string, unknown> = {}) {
  return { id: "owner-1", role: "OWNER", staffId: "staff-1", storeId: "store-zhubei", ...overrides };
}

function request(storeId = "store-zhubei") {
  return new Request("http://test/api/admin/messenger/repair", { method: "POST", body: JSON.stringify({ storeId }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: owner() });
  mockResolveStore.mockResolvedValue({ id: "store-zhubei", slug: "zhubei", name: "竹北店" });
  mockRepair.mockResolvedValue({ status: "blocked", code: "PAGE_TOKEN_VALIDATION_FAILED", classification: "token_invalid_or_expired", calls: { page: { ok: false, httpStatus: 400, error: "http_error", graphCode: 190 } } });
});

afterEach(async () => {
  const { resetMessengerRepairRateLimitForTests } = await import("@/app/api/admin/messenger/repair/route");
  resetMessengerRepairRateLimitForTests();
});

describe("Messenger Page repair admin API", () => {
  it("rejects unauthenticated and non-admin callers", async () => {
    const { POST } = await import("@/app/api/admin/messenger/repair/route");
    mockAuth.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(401);
    mockAuth.mockResolvedValueOnce({ user: owner({ role: "PARTNER" }) });
    expect((await POST(request())).status).toBe(403);
    expect(mockRepair).not.toHaveBeenCalled();
  });

  it("rejects a non-Zhubei or cross-store request before Meta work", async () => {
    const { POST } = await import("@/app/api/admin/messenger/repair/route");
    mockResolveStore.mockResolvedValueOnce({ id: "store-other", slug: "other", name: "其他店" });
    expect((await POST(request("store-other"))).status).toBe(403);
    expect(mockRepair).not.toHaveBeenCalled();
    mockResolveStore.mockRejectedValueOnce(new Error("cross-store"));
    expect((await POST(request("store-other"))).status).toBe(403);
    expect(mockRepair).not.toHaveBeenCalled();
  });

  it("returns only a safe, blocked token diagnosis with no-store caching", async () => {
    const { POST } = await import("@/app/api/admin/messenger/repair/route");
    const response = await POST(request());
    const body = await response.json();
    expect(response.status).toBe(422);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({ code: "PAGE_TOKEN_VALIDATION_FAILED", classification: "token_invalid_or_expired" });
    expect(JSON.stringify(body)).not.toContain("page-token-never-leak");
    expect(mockRepair).toHaveBeenCalledWith({ storeId: "store-zhubei", storeSlug: "zhubei", requestedByUserId: "owner-1" });
  });
});
