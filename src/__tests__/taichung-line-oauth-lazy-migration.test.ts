import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.hoisted(() => vi.fn());
const mockVerifyTaichungLineSessionDetailed = vi.hoisted(() => vi.fn());
const mockCreateVerifiedCustomerIdentityLink = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));
vi.mock("@/lib/line-oauth/taichung-session", () => ({
  TAICHUNG_LINE_SESSION_COOKIE: "taichung_line_oauth_session",
  verifyTaichungLineSessionDetailed: (...args: unknown[]) => mockVerifyTaichungLineSessionDetailed(...args),
}));
vi.mock("@/server/services/namespaced-customer-identity-link", () => ({
  createVerifiedCustomerIdentityLink: (...args: unknown[]) => mockCreateVerifiedCustomerIdentityLink(...args),
}));

describe("Taichung LINE post-session lazy identity migration", () => {
  const bridge = {
    attemptId: "attempt-1",
    userId: "central-user",
    customerId: "customer-taichung",
    storeId: "store-taichung",
    lineUserId: "verified-line-user",
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: {
        id: bridge.userId,
        role: "CUSTOMER",
        customerId: bridge.customerId,
        storeId: bridge.storeId,
        storeSlug: "taichung",
      },
    });
    mockVerifyTaichungLineSessionDetailed.mockReturnValue({ status: "verified", bridge });
    mockCreateVerifiedCustomerIdentityLink.mockResolvedValue({ status: "upserted" });
  });

  async function complete() {
    const { POST } = await import("@/app/api/line-oauth/taichung/complete/route");
    return POST(new NextRequest("https://www.steamfoot.com/api/line-oauth/taichung/complete", {
      method: "POST",
      headers: { cookie: "taichung_line_oauth_session=signed-bridge" },
    }));
  }

  async function completeServerRedirect() {
    const { GET } = await import("@/app/api/line-oauth/taichung/complete/route");
    return GET(new NextRequest("https://www.steamfoot.com/api/line-oauth/taichung/complete", {
      headers: { cookie: "taichung_line_oauth_session=signed-bridge" },
    }));
  }

  it("upserts the verified LINE identity only after the matching Auth.js session exists", async () => {
    const response = await complete();

    expect(response.status).toBe(200);
    expect(mockCreateVerifiedCustomerIdentityLink).toHaveBeenCalledWith({
      userId: bridge.userId,
      storeId: bridge.storeId,
      customerId: bridge.customerId,
      provider: "line_login",
      providerAccountId: bridge.lineUserId,
    });
    expect(response.headers.get("set-cookie")).toContain("taichung_line_oauth_session=;");
  });

  it("redirects to the Taichung book page only after server completion succeeds", async () => {
    const response = await completeServerRedirect();

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://www.steamfoot.com/s/taichung/book",
    );
    expect(mockCreateVerifiedCustomerIdentityLink).toHaveBeenCalledOnce();
  });

  it("does not migrate when Auth.js session creation did not succeed", async () => {
    mockAuth.mockResolvedValue(null);

    const response = await complete();

    expect(response.status).toBe(401);
    expect(mockCreateVerifiedCustomerIdentityLink).not.toHaveBeenCalled();
  });

  it("does not migrate when the signed bridge does not belong to the session", async () => {
    mockVerifyTaichungLineSessionDetailed.mockReturnValue({
      status: "verified",
      bridge: { ...bridge, customerId: "other-customer" },
    });

    const response = await complete();

    expect(response.status).toBe(401);
    expect(mockCreateVerifiedCustomerIdentityLink).not.toHaveBeenCalled();
  });

  it("keeps the bridge for a safe retry when migration rejects ownership", async () => {
    mockCreateVerifiedCustomerIdentityLink.mockResolvedValue({ status: "error", error: "CUSTOMER_OWNED_BY_ANOTHER_USER" });

    const response = await complete();

    expect(response.status).toBe(409);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
