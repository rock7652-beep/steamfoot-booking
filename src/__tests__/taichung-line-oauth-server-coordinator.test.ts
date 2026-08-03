import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockSignIn = vi.hoisted(() => vi.fn());
const mockVerifyDetailed = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ signIn: (...args: unknown[]) => mockSignIn(...args) }));
vi.mock("@/lib/line-oauth/taichung-session", () => ({
  TAICHUNG_LINE_SESSION_COOKIE: "taichung_line_oauth_session",
  verifyTaichungLineSessionDetailed: (...args: unknown[]) => mockVerifyDetailed(...args),
}));
vi.mock("@/lib/line-oauth/taichung-handoff-log", () => ({
  logTaichungLineHandoff: vi.fn(),
}));

describe("Taichung LINE server-driven coordinator handoff", () => {
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
    mockVerifyDetailed.mockReturnValue({ status: "verified", bridge });
    mockSignIn.mockResolvedValue(
      "https://www.steamfoot.com/api/line-oauth/taichung/complete",
    );
  });

  async function coordinator() {
    const { GET } = await import("@/app/api/line-oauth/taichung/coordinator/route");
    return GET(new NextRequest("https://www.steamfoot.com/api/line-oauth/taichung/coordinator", {
      headers: { cookie: "taichung_line_oauth_session=signed-bridge" },
    }));
  }

  it("starts credentials sign-in from the server and redirects only to completion", async () => {
    const response = await coordinator();

    expect(mockSignIn).toHaveBeenCalledWith("line-taichung-coordinator", {
      redirect: false,
      redirectTo: "https://www.steamfoot.com/api/line-oauth/taichung/complete",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://www.steamfoot.com/api/line-oauth/taichung/complete",
    );
  });

  it("fails closed without a signed bridge or after credentials failure", async () => {
    mockVerifyDetailed.mockReturnValue({ status: "rejected", error: "bridge_cookie_missing" });
    let response = await coordinator();
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("bridge_cookie_missing");

    mockVerifyDetailed.mockReturnValue({ status: "verified", bridge });
    mockSignIn.mockResolvedValue("https://www.steamfoot.com/api/auth/error");
    response = await coordinator();
    expect(response.headers.get("location")).toContain("coordinator_signin_failed");
  });

  it.each([
    "bridge_signature_invalid",
    "bridge_expired",
    "bridge_payload_invalid",
  ])("reports %s without starting credentials sign-in", async (error) => {
    mockVerifyDetailed.mockReturnValue({ status: "rejected", error });

    const response = await coordinator();

    expect(response.headers.get("location")).toContain(error);
    expect(mockSignIn).not.toHaveBeenCalled();
  });
});
