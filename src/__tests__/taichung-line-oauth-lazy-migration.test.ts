import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.hoisted(() => vi.fn());
const mockVerifyTaichungLineSession = vi.hoisted(() => vi.fn());
const mockUpsertCustomerIdentityLink = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));
vi.mock("@/lib/line-oauth/taichung-session", () => ({
  TAICHUNG_LINE_SESSION_COOKIE: "taichung_line_oauth_session",
  verifyTaichungLineSession: (...args: unknown[]) => mockVerifyTaichungLineSession(...args),
}));
vi.mock("@/server/services/customer-identity-link", () => ({
  upsertCustomerIdentityLink: (...args: unknown[]) => mockUpsertCustomerIdentityLink(...args),
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
    mockVerifyTaichungLineSession.mockReturnValue(bridge);
    mockUpsertCustomerIdentityLink.mockResolvedValue({ status: "upserted" });
  });

  async function complete() {
    const { POST } = await import("@/app/api/line-oauth/taichung/complete/route");
    return POST(new NextRequest("https://www.steamfoot.com/api/line-oauth/taichung/complete", {
      method: "POST",
      headers: { cookie: "taichung_line_oauth_session=signed-bridge" },
    }));
  }

  it("upserts the verified LINE identity only after the matching Auth.js session exists", async () => {
    const response = await complete();

    expect(response.status).toBe(200);
    expect(mockUpsertCustomerIdentityLink).toHaveBeenCalledWith({
      userId: bridge.userId,
      storeId: bridge.storeId,
      customerId: bridge.customerId,
      provider: "line",
      providerAccountId: bridge.lineUserId,
      lineUserId: bridge.lineUserId,
    });
    expect(response.headers.get("set-cookie")).toContain("taichung_line_oauth_session=;");
  });

  it("does not migrate when Auth.js session creation did not succeed", async () => {
    mockAuth.mockResolvedValue(null);

    const response = await complete();

    expect(response.status).toBe(401);
    expect(mockUpsertCustomerIdentityLink).not.toHaveBeenCalled();
  });

  it("does not migrate when the signed bridge does not belong to the session", async () => {
    mockVerifyTaichungLineSession.mockReturnValue({ ...bridge, customerId: "other-customer" });

    const response = await complete();

    expect(response.status).toBe(401);
    expect(mockUpsertCustomerIdentityLink).not.toHaveBeenCalled();
  });

  it("keeps the bridge for a safe retry when migration rejects ownership", async () => {
    mockUpsertCustomerIdentityLink.mockResolvedValue({ status: "error", error: "CUSTOMER_OWNED_BY_ANOTHER_USER" });

    const response = await complete();

    expect(response.status).toBe(409);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
