import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { handlers, signIn } from "@/lib/auth";
import { consumeTaichungCallback, isTaichungCoordinatorState, resolveTaichungLinkedCustomer, TaichungOAuthError } from "@/lib/line-oauth/taichung-coordinator";
import { issueTaichungLineSession } from "@/lib/line-oauth/taichung-session";
import { setOAuthTempSession } from "@/lib/server/oauth-temp-session";
import { resolveTaichungCallbackUrl } from "@/lib/line-oauth/callback-url";

function preserveTaichungStore(response: NextResponse): NextResponse {
  response.cookies.set("store-slug", "taichung", {
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24,
  });
  return response;
}

function lineIdentityFingerprint(value: string): { suffix: string; sha256Prefix: string } {
  return {
    suffix: value.slice(-8),
    sha256Prefix: createHash("sha256").update(value).digest("hex").slice(0, 12),
  };
}

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state");
  // `tc1.` is coordinator-owned. Invalid coordinator state must fail closed
  // here; it must never be passed to the legacy global LINE provider.
  if (!isTaichungCoordinatorState(state)) return handlers.GET(request);
  const code = request.nextUrl.searchParams.get("code");
  if (!code || !state) return NextResponse.json({ error: "Invalid LINE callback" }, { status: 400 });
  try {
    const callbackUrl = resolveTaichungCallbackUrl(request.nextUrl.host);
    if (!callbackUrl) return NextResponse.json({ error: "Invalid LINE callback host" }, { status: 400 });
    const { profile, storeId, attemptId } = await consumeTaichungCallback({ state, code, callbackUrl });
    const customer = await resolveTaichungLinkedCustomer({
      storeId,
      lineUserId: profile.userId,
    });

    console.info("[line-oauth][taichung] identity diagnostic", {
      attemptId,
      storeId,
      profileLine: lineIdentityFingerprint(profile.userId),
      matchedCustomer: !!customer,
    });

    if (customer) {
      const ticket = issueTaichungLineSession({
        attemptId: attemptId,
        userId: customer.userId,
        customerId: customer.id,
        storeId,
        lineUserId: profile.userId,
      });
      const redirectTo = new URL("/s/taichung/book", request.url).toString();
      const responseUrl = await signIn("line-taichung-coordinator", {
        redirect: false,
        redirectTo,
        ticket,
      });
      const destination = new URL(String(responseUrl), request.url);
      if (destination.origin !== request.nextUrl.origin || destination.pathname !== "/s/taichung/book") {
        return NextResponse.json({ error: "LINE callback failed" }, { status: 400 });
      }
      return preserveTaichungStore(NextResponse.redirect(destination, 303));
    }
    // No valid same-store identity link: retain the verified phone confirmation
    // path. No Customer, Account, or identity link is written by the callback.
    await setOAuthTempSession({ attemptId, lineUserId: profile.userId, displayName: profile.displayName ?? "LINE 用戶", storeId, channelKey: "taichung" });
    return preserveTaichungStore(
      NextResponse.redirect(new URL("/oauth-confirm?callbackUrl=%2Fs%2Ftaichung%2Fbook", request.url)),
    );
  } catch (error) {
    const message = error instanceof TaichungOAuthError ? error.message : "LINE callback failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const POST = handlers.POST;
