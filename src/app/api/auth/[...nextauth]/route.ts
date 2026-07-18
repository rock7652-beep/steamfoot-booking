import { NextRequest, NextResponse } from "next/server";
import { handlers } from "@/lib/auth";
import { activateTaichungCustomer, consumeTaichungCallback, isTaichungCoordinatorState, resolveTaichungCustomer, TaichungOAuthError } from "@/lib/line-oauth/taichung-coordinator";
import { issueTaichungLineSession, TAICHUNG_LINE_SESSION_COOKIE, TAICHUNG_LINE_SESSION_MAX_AGE } from "@/lib/line-oauth/taichung-session";
import { setOAuthTempSession } from "@/lib/server/oauth-temp-session";
import { resolveTaichungCallbackUrl } from "@/lib/line-oauth/callback-url";

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state");
  // `tc1.` is coordinator-owned.  Invalid coordinator state must fail closed
  // here; it must never be passed to the legacy global LINE provider.
  if (!isTaichungCoordinatorState(state)) return handlers.GET(request);
  const code = request.nextUrl.searchParams.get("code");
  if (!code || !state) return NextResponse.json({ error: "Invalid LINE callback" }, { status: 400 });
  try {
    const callbackUrl = resolveTaichungCallbackUrl(request.nextUrl.host);
    if (!callbackUrl) return NextResponse.json({ error: "Invalid LINE callback host" }, { status: 400 });
    const { profile, storeId } = await consumeTaichungCallback({ state, code, callbackUrl });
    const customer = await resolveTaichungCustomer(storeId, profile.userId);
    if (customer) {
      const active = await activateTaichungCustomer({ storeId, customerId: customer.id, lineUserId: profile.userId, displayName: profile.displayName });
      const url = new URL("/line-oauth/complete", request.url);
      url.searchParams.set("callbackUrl", "/s/taichung/book");
      const response = NextResponse.redirect(url);
      response.cookies.set(TAICHUNG_LINE_SESSION_COOKIE, issueTaichungLineSession({
        attemptId: "consumed", userId: active.userId, customerId: active.id, storeId,
      }), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: TAICHUNG_LINE_SESSION_MAX_AGE });
      return response;
    }
    // No same-store identity/customer: retain the existing verified phone
    // confirmation path.  No Customer, Account, or identity link is written
    // by the coordinator callback.
    await setOAuthTempSession({ lineUserId: profile.userId, displayName: profile.displayName ?? "LINE 用戶", storeId, channelKey: "taichung" });
    return NextResponse.redirect(new URL("/oauth-confirm?callbackUrl=%2Fs%2Ftaichung%2Fbook", request.url));
  } catch (error) {
    const message = error instanceof TaichungOAuthError ? error.message : "LINE callback failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const POST = handlers.POST;
