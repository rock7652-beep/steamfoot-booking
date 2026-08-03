import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.hoisted(() => vi.fn());
const mockGetOAuthTempSession = vi.hoisted(() => vi.fn());
const mockComplete = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
vi.mock("@/lib/server/oauth-temp-session", () => ({
  getOAuthTempSession: () => mockGetOAuthTempSession(),
}));
vi.mock("@/server/actions/taichung-provider-line-finalize", () => ({
  completeTaichungProviderLineOwnershipProof: (input: unknown) => mockComplete(input),
}));

describe("Taichung LINE finalize server handoff", () => {
  const temp = { attemptId: "attempt-1", storeId: "store-taichung", lineUserId: "line-login" };
  const completion = { attemptId: "attempt-1", userId: "user-1", customerId: "customer-1", storeId: "store-taichung" };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockGetOAuthTempSession.mockResolvedValue(temp);
    mockComplete.mockResolvedValue({ status: "completed", completion });
  });

  async function finalize(customerId = "customer-1") {
    const { GET } = await import("@/app/api/line-oauth/taichung/finalize/route");
    return GET(new NextRequest(`https://www.steamfoot.com/api/line-oauth/taichung/finalize?customerId=${customerId}`));
  }

  it("completes ownership binding on the server and redirects without a bridge cookie", async () => {
    const response = await finalize();

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://www.steamfoot.com/s/taichung/book");
    expect(mockComplete).toHaveBeenCalledWith({ customerId: "customer-1", session: { user: { id: "user-1" } }, tempSession: temp });
    expect(response.headers.get("set-cookie")).toContain("oauth_line_session=;");
  });

  it("keeps the temp cookie intact and blocks completion when a guard rejects", async () => {
    mockComplete.mockResolvedValue({ status: "rejected", error: "customer_mismatch" });

    const response = await finalize();

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("/oauth-confirm/finalize?error=customer_mismatch");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mockComplete).toHaveBeenCalledOnce();
  });
});
