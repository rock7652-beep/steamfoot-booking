import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.hoisted(() => vi.fn());
const mockTempSession = vi.hoisted(() => vi.fn());
const mockComplete = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));
vi.mock("@/lib/server/oauth-temp-session", () => ({
  getOAuthTempSession: (...args: unknown[]) => mockTempSession(...args),
}));
vi.mock("@/server/actions/taichung-provider-line-finalize", () => ({
  completeTaichungProviderLineOwnershipProof: (...args: unknown[]) => mockComplete(...args),
}));
vi.mock("@/lib/line-oauth/taichung-handoff-log", () => ({
  logTaichungLineHandoff: vi.fn(),
}));

describe("Taichung phone ownership server completion", () => {
  const completion = {
    attemptId: "attempt-1",
    userId: "user-1",
    customerId: "customer-1",
    storeId: "store-taichung",
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: completion.userId } });
    mockTempSession.mockResolvedValue({
      attemptId: completion.attemptId,
      storeId: completion.storeId,
      lineUserId: "line-user-1",
    });
    mockComplete.mockResolvedValue({ status: "completed", completion });
  });

  it("completes with the existing session and temp context without issuing a bridge cookie", async () => {
    const { GET: finalize } = await import("@/app/api/line-oauth/taichung/finalize/route");
    const finalizeResponse = await finalize(new NextRequest(
      "https://www.steamfoot.com/api/line-oauth/taichung/finalize?customerId=customer-1",
    ));
    expect(finalizeResponse.headers.get("location")).toBe(
      "https://www.steamfoot.com/s/taichung/book",
    );
    expect(finalizeResponse.headers.get("set-cookie")).toContain("oauth_line_session=;");
    expect(finalizeResponse.headers.get("set-cookie")).not.toContain("taichung_line_oauth_session=");
    expect(mockComplete).toHaveBeenCalledWith({
      customerId: "customer-1",
      session: { user: { id: completion.userId } },
      tempSession: {
        attemptId: completion.attemptId,
        storeId: completion.storeId,
        lineUserId: "line-user-1",
      },
    });
  });
});
