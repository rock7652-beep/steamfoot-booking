import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockConsumeTaichungCallback = vi.hoisted(() => vi.fn());
const mockIsTaichungCoordinatorState = vi.hoisted(() => vi.fn());
const mockResolveTaichungLinkedCustomer = vi.hoisted(() => vi.fn());
const mockIssueTaichungLineSession = vi.hoisted(() => vi.fn());
const mockSetOAuthTempSession = vi.hoisted(() => vi.fn());
const mockResolveTaichungCallbackUrl = vi.hoisted(() => vi.fn());
const mockSignIn = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ handlers: { GET: vi.fn(), POST: vi.fn() }, signIn: (...args: unknown[]) => mockSignIn(...args) }));
vi.mock("@/lib/line-oauth/taichung-coordinator", () => ({
  consumeTaichungCallback: (...args: unknown[]) => mockConsumeTaichungCallback(...args),
  isTaichungCoordinatorState: (...args: unknown[]) => mockIsTaichungCoordinatorState(...args),
  resolveTaichungLinkedCustomer: (...args: unknown[]) => mockResolveTaichungLinkedCustomer(...args),
  TaichungOAuthError: class TaichungOAuthError extends Error {},
}));
vi.mock("@/lib/line-oauth/taichung-session", () => ({
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
    mockSignIn.mockResolvedValue("https://www.steamfoot.com/s/taichung/book");
  });

  async function callback() {
    const { GET } = await import("@/app/api/auth/[...nextauth]/route");
    return GET(new NextRequest("https://www.steamfoot.com/api/auth/callback/line?state=tc1.state&code=code"));
  }

  it("starts a server-internal coordinator session for an already linked same-store member without a browser bridge", async () => {
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
    expect(mockSignIn).toHaveBeenCalledWith("line-taichung-coordinator", {
      redirect: false,
      redirectTo: "https://www.steamfoot.com/s/taichung/book",
      ticket: "signed-bridge",
    });
    expect(response.headers.get("location")).toBe("https://www.steamfoot.com/s/taichung/book");
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
    expect(mockSignIn).not.toHaveBeenCalled();
  });
});
