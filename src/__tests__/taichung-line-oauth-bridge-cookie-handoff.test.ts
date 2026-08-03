import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.hoisted(() => vi.fn());
const mockSignIn = vi.hoisted(() => vi.fn());
const mockTempSession = vi.hoisted(() => vi.fn());
const mockPrepare = vi.hoisted(() => vi.fn());
const mockIssue = vi.hoisted(() => vi.fn());
const mockVerifyDetailed = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));
vi.mock("@/lib/server/oauth-temp-session", () => ({
  getOAuthTempSession: (...args: unknown[]) => mockTempSession(...args),
}));
vi.mock("@/server/actions/taichung-provider-line-finalize", () => ({
  prepareTaichungProviderLineBridge: (...args: unknown[]) => mockPrepare(...args),
}));
vi.mock("@/lib/line-oauth/taichung-session", () => ({
  TAICHUNG_LINE_SESSION_COOKIE: "taichung_line_oauth_session",
  TAICHUNG_LINE_SESSION_COOKIE_OPTIONS: {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/line-oauth/taichung",
    maxAge: 300,
  },
  issueTaichungLineSession: (...args: unknown[]) => mockIssue(...args),
  verifyTaichungLineSessionDetailed: (...args: unknown[]) => mockVerifyDetailed(...args),
}));
vi.mock("@/lib/line-oauth/taichung-handoff-log", () => ({
  logTaichungLineHandoff: vi.fn(),
}));

describe("Taichung finalize-to-coordinator bridge cookie handoff", () => {
  const bridge = {
    attemptId: "attempt-1",
    userId: "user-1",
    customerId: "customer-1",
    storeId: "store-taichung",
    lineUserId: "line-user-1",
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: bridge.userId } });
    mockTempSession.mockResolvedValue({
      attemptId: bridge.attemptId,
      storeId: bridge.storeId,
      lineUserId: bridge.lineUserId,
    });
    mockPrepare.mockResolvedValue({ status: "ready", bridge });
    mockIssue.mockReturnValue("signed-bridge");
    mockVerifyDetailed.mockReturnValue({ status: "verified", bridge });
    mockSignIn.mockResolvedValue(
      "https://www.steamfoot.com/api/line-oauth/taichung/complete",
    );
  });

  it("carries the Set-Cookie value from the finalize redirect into coordinator sign-in", async () => {
    const { GET: finalize } = await import("@/app/api/line-oauth/taichung/finalize/route");
    const finalizeResponse = await finalize(new NextRequest(
      "https://www.steamfoot.com/api/line-oauth/taichung/finalize?customerId=customer-1",
    ));
    const setCookie = finalizeResponse.headers.get("set-cookie");

    expect(finalizeResponse.headers.get("location")).toBe(
      "https://www.steamfoot.com/api/line-oauth/taichung/coordinator",
    );
    expect(setCookie).toContain("taichung_line_oauth_session=signed-bridge");
    expect(setCookie).toContain("Path=/api/line-oauth/taichung");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=lax");

    const cookie = setCookie?.match(/taichung_line_oauth_session=[^;]+/)?.[0];
    expect(cookie).toBe("taichung_line_oauth_session=signed-bridge");

    const { GET: coordinator } = await import("@/app/api/line-oauth/taichung/coordinator/route");
    const coordinatorResponse = await coordinator(new NextRequest(
      "https://www.steamfoot.com/api/line-oauth/taichung/coordinator",
      { headers: { cookie: cookie! } },
    ));

    expect(mockVerifyDetailed).toHaveBeenLastCalledWith("signed-bridge");
    expect(mockSignIn).toHaveBeenCalledWith("line-taichung-coordinator", {
      redirect: false,
      redirectTo: "https://www.steamfoot.com/api/line-oauth/taichung/complete",
    });
    expect(coordinatorResponse.status).toBe(303);
  });
});
