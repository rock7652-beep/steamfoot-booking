import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const handlersGet = vi.hoisted(() => vi.fn());
const signIn = vi.hoisted(() => vi.fn());
const consumeMobileCallback = vi.hoisted(() => vi.fn());
const resolveVerifiedCustomer = vi.hoisted(() => vi.fn());
const issueSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  handlers: { GET: (...args: unknown[]) => handlersGet(...args), POST: vi.fn() },
  signIn: (...args: unknown[]) => signIn(...args),
}));
vi.mock("@/lib/line-oauth/mobile-coordinator", () => ({
  isMobileCoordinatorState: (state: string | null) => state?.startsWith("wm1.") ?? false,
  consumeMobileCallback: (...args: unknown[]) => consumeMobileCallback(...args),
  MobileLineOAuthError: class MobileLineOAuthError extends Error {},
}));
vi.mock("@/lib/line-oauth/taichung-coordinator", () => ({
  isTaichungCoordinatorState: () => false,
  consumeTaichungCallback: vi.fn(),
  resolveTaichungLinkedCustomer: vi.fn(),
  TaichungOAuthError: class TaichungOAuthError extends Error {},
}));
vi.mock("@/server/services/verified-line-customer", () => ({
  resolveVerifiedLineCustomer: (...args: unknown[]) => resolveVerifiedCustomer(...args),
}));
vi.mock("@/lib/line-oauth/taichung-session", () => ({
  issueTaichungLineSession: (...args: unknown[]) => issueSession(...args),
}));
vi.mock("@/lib/server/oauth-temp-session", () => ({ setOAuthTempSession: vi.fn() }));
vi.mock("@/lib/line-oauth/callback-url", () => ({
  resolveTaichungCallbackUrl: () => "https://preview.example/api/auth/callback/line",
}));

describe("mobile LINE OAuth callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeMobileCallback.mockResolvedValue({
      attemptId: "attempt-1",
      storeId: "store-spa",
      storeSlug: "spa-test",
      returnPath: "/s/spa-test/liff/spa-work",
      profile: { userId: "line-user", displayName: "LINE User" },
    });
    resolveVerifiedCustomer.mockResolvedValue({ id: "customer-spa", userId: "user-spa" });
    issueSession.mockReturnValue("signed-ticket");
    signIn.mockResolvedValue("https://preview.example/s/spa-test/liff/spa-work");
  });

  it("mints a same-store session and returns to the signed work path", async () => {
    const { GET } = await import("@/app/api/auth/[...nextauth]/route");
    const response = await GET(new NextRequest(
      "https://preview.example/api/auth/callback/line?state=wm1.signed&code=code",
    ));

    expect(resolveVerifiedCustomer).toHaveBeenCalledWith("store-spa", "line-user");
    expect(signIn).toHaveBeenCalledWith("line-taichung-coordinator", {
      redirect: false,
      redirectTo: "https://preview.example/s/spa-test/liff/spa-work",
      ticket: "signed-ticket",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://preview.example/s/spa-test/liff/spa-work",
    );
    expect(response.headers.getSetCookie().join("\n")).toContain("store-slug=spa-test");
  });

  it("fails closed to the same store when the LINE identity is not linked", async () => {
    resolveVerifiedCustomer.mockResolvedValue(null);
    const { GET } = await import("@/app/api/auth/[...nextauth]/route");
    const response = await GET(new NextRequest(
      "https://preview.example/api/auth/callback/line?state=wm1.signed&code=code",
    ));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://preview.example/s/spa-test/?error=OAuthAccountNotLinked",
    );
    expect(signIn).not.toHaveBeenCalled();
  });
});
