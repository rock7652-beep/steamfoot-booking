import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { OAUTH_TEMP_COOKIE_NAME } from "@/lib/oauth-temp-session";
import { getOAuthTempSession } from "@/lib/server/oauth-temp-session";
import { logTaichungLineHandoff } from "@/lib/line-oauth/taichung-handoff-log";
import {
  issueTaichungLineSession,
  TAICHUNG_LINE_SESSION_COOKIE,
  TAICHUNG_LINE_SESSION_COOKIE_OPTIONS,
} from "@/lib/line-oauth/taichung-session";
import { prepareTaichungProviderLineBridge } from "@/server/actions/taichung-provider-line-finalize";

/**
 * Server-side handoff after customer-phone sign-in. The bridge is issued in
 * the redirect response itself, so the next step never depends on a React
 * effect firing after /oauth-confirm/finalize renders.
 */
export async function GET(request: NextRequest) {
  const customerId = request.nextUrl.searchParams.get("customerId") ?? "";
  const [session, tempSession] = await Promise.all([auth(), getOAuthTempSession()]);
  const prepared = await prepareTaichungProviderLineBridge({
    customerId,
    session,
    tempSession,
  });

  if (prepared.status === "rejected") {
    logTaichungLineHandoff("finalize_guard_rejected", {
      attemptId: tempSession?.attemptId,
      customerId,
      storeId: tempSession?.storeId,
      errorCode: prepared.error,
    });
    const errorUrl = new URL("/oauth-confirm/finalize", request.url);
    errorUrl.searchParams.set("error", prepared.error);
    return NextResponse.redirect(errorUrl, 303);
  }

  logTaichungLineHandoff("finalize_guard_passed", prepared.bridge);
  const response = NextResponse.redirect(
    new URL("/api/line-oauth/taichung/coordinator", request.url),
    303,
  );
  response.cookies.set(
    TAICHUNG_LINE_SESSION_COOKIE,
    issueTaichungLineSession(prepared.bridge),
    TAICHUNG_LINE_SESSION_COOKIE_OPTIONS,
  );
  // Delete only after the signed bridge is attached to this response. Guard
  // failures leave the temp session intact so the user can safely restart.
  response.cookies.delete(OAUTH_TEMP_COOKIE_NAME);
  logTaichungLineHandoff("bridge_issued", prepared.bridge);
  return response;
}
