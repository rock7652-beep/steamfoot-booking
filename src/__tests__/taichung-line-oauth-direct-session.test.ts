import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockConsumeTaichungCallback = vi.hoisted(() => vi.fn());
const mockIsTaichungCoordinatorState = vi.hoisted(() => vi.fn());
const mockResolveTaichungLinkedCustomer = vi.hoisted(() => vi.fn());
const mockIssueTaichungLineSession = vi.hoisted(() => vi.fn());
const mockSetOAuthTempSession = vi.hoisted(() => vi.fn());
const mockResolveTaichungCallbackUrl = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ handlers: { GET: vi.fn(), POST: vi.fn() } }));
vi.mock("@/lib/line-oauth/taichung-coordinator", () => ({
  consumeTaichungCallback: (...args: unknown[]) => mockConsumeTaichungCallback(...args),
  isTaichungCoordinatorState: (...args: unknown[]) => mockIsTaichungCoordinatorState(...args),
  resolveTaichungLinkedCustomer: (...args: unknown[]) => mockResolveTaichungLinkedCustomer(...args),
  TaichungOAuthError: class TaichungOAuthError extends Error {},
}));
vi.mock("@/lib/line-oauth/taichung-session", () => ({
  TAICHUNG_LINE_SESSION_COOKIE: "taichung_line_session",
  TAICHUNG_LINE_SESSION_COOKIE_OPTIONS: {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/line-oauth/taichung",
    maxAge: 300,
  },
  issueTaichungLineSession: (...args: unknown[]) => mockIssueTaichungLineSession(...args),
}));
vi.mock("@/lib/server/oauth-temp-session", () => ({
  setOAuthTempSession: (...args: unknown[]) => mockSetOAuthTempSession(...args),
}));
vi.mock("@/lib/line-oauth/callback-url", () => ({
  resolveTaichungCallbackUrl: (...args: unknown[]) => mockResolveTaichungCallbackUrl(...args),
}));

describe("Taichung LINE callback direct session", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockIsTaichungCoordinatorState.mockReturnValue(true);
    mockResolveTaichungCallbackUrl.mockReturnValue("https://www.steamfoot.com/api/auth/callback/line");
    mockConsumeTaichungCallback.mockResolvedValue({
      attemptId: "attempt-1",
      storeId: "store-taichung",
      profile: { userId: "line-user", displayName: "LINE User" },
    });
    mockIssueTaichungLineSession.mockReturnValue("signed-bridge");
  });

  async function callback() {
    const { GET } = await import("@/app/api/auth/[...nextauth]/route");
    return GET(new NextRequest("https://www.steamfoot.com/api/auth/callback/line?state=tc1.state&code=code"));
  }

  it("issues a new Taichung bridge for an already linked same-store member without a phone challenge", async () => {
    mockResolveTaichungLinkedCustomer.mockResolvedValue({
      id: "customer-taichung",
      userId: "central-user",
    });

    const response = await callback();

    expect(mockResolveTaichungLinkedCustomer).toHaveBeenCalledWith({
      storeId: "store-taichung",
      lineUserId: "line-user",
    });
    expect(mockIssueTaichungLineSession).toHaveBeenCalledWith({
      attemptId: "attempt-1",
      customerId: "customer-taichung",
      storeId: "store-taichung",
      userId: "central-user",
      lineUserId: "line-user",
    });
    expect(mockSetOAuthTempSession).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://www.steamfoot.com/api/line-oauth/taichung/coordinator");
    expect(response.headers.get("set-cookie")).toContain("taichung_line_session=signed-bridge");
    expect(response.headers.get("set-cookie")).toContain("Path=/api/line-oauth/taichung");
  });

  it("keeps the phone-and-password challenge for a first-time or other-store-only LINE identity", async () => {
    mockResolveTaichungLinkedCustomer.mockResolvedValue(null);

    const response = await callback();

    expect(mockSetOAuthTempSession).toHaveBeenCalledWith({
      lineUserId: "line-user",
      displayName: "LINE User",
      storeId: "store-taichung",
      channelKey: "taichung",
      attemptId: "attempt-1",
    });
    expect(response.headers.get("location")).toBe(
      "https://www.steamfoot.com/oauth-confirm?callbackUrl=%2Fs%2Ftaichung%2Fbook",
    );
  });
});
