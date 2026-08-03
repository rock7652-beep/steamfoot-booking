import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.hoisted(() => vi.fn());
const mockGetOAuthTempSession = vi.hoisted(() => vi.fn());
const mockPrepare = vi.hoisted(() => vi.fn());
const mockIssue = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
vi.mock("@/lib/server/oauth-temp-session", () => ({
  getOAuthTempSession: () => mockGetOAuthTempSession(),
}));
vi.mock("@/server/actions/taichung-provider-line-finalize", () => ({
  prepareTaichungProviderLineBridge: (input: unknown) => mockPrepare(input),
}));
vi.mock("@/lib/line-oauth/taichung-session", () => ({
  TAICHUNG_LINE_SESSION_COOKIE: "taichung_line_oauth_session",
  TAICHUNG_LINE_SESSION_MAX_AGE: 300,
  issueTaichungLineSession: (input: unknown) => mockIssue(input),
}));

describe("Taichung LINE finalize server handoff", () => {
  const temp = { attemptId: "attempt-1", storeId: "store-taichung", lineUserId: "line-login" };
  const bridge = { attemptId: "attempt-1", userId: "user-1", customerId: "customer-1", storeId: "store-taichung", lineUserId: "line-login" };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockGetOAuthTempSession.mockResolvedValue(temp);
    mockPrepare.mockResolvedValue({ status: "ready", bridge });
    mockIssue.mockReturnValue("signed-bridge");
  });

  async function finalize(customerId = "customer-1") {
    const { GET } = await import("@/app/api/line-oauth/taichung/finalize/route");
    return GET(new NextRequest(`https://www.steamfoot.com/api/line-oauth/taichung/finalize?customerId=${customerId}`));
  }

  it("issues the signed bridge in the server redirect before coordinator sign-in", async () => {
    const response = await finalize();

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://www.steamfoot.com/api/line-oauth/taichung/coordinator");
    expect(mockPrepare).toHaveBeenCalledWith({ customerId: "customer-1", session: { user: { id: "user-1" } }, tempSession: temp });
    expect(mockIssue).toHaveBeenCalledWith(bridge);
    expect(response.headers.get("set-cookie")).toContain("taichung_line_oauth_session=signed-bridge");
    expect(response.headers.get("set-cookie")).toContain("oauth_line_session=;");
  });

  it("keeps the temp cookie intact and blocks completion when a guard rejects", async () => {
    mockPrepare.mockResolvedValue({ status: "rejected", error: "customer_mismatch" });

    const response = await finalize();

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("/oauth-confirm/finalize?error=customer_mismatch");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mockIssue).not.toHaveBeenCalled();
  });
});
