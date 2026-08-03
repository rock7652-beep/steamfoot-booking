import { NextRequest, NextResponse } from "next/server";
import { signIn } from "@/lib/auth";
import {
  TAICHUNG_LINE_SESSION_COOKIE,
  verifyTaichungLineSession,
} from "@/lib/line-oauth/taichung-session";
import { logTaichungLineHandoff } from "@/lib/line-oauth/taichung-handoff-log";

function blocked(request: NextRequest, errorCode: string) {
  logTaichungLineHandoff("final_redirect_blocked", { errorCode });
  const url = new URL("/line-oauth/complete", request.url);
  url.searchParams.set("error", errorCode);
  return NextResponse.redirect(url, 303);
}

/**
 * Starts the Auth.js credentials flow on the server. This route is reached by
 * the finalize redirect, so it does not rely on client hydration or an effect.
 */
export async function GET(request: NextRequest) {
  const bridge = verifyTaichungLineSession(
    request.cookies.get(TAICHUNG_LINE_SESSION_COOKIE)?.value,
  );
  if (!bridge) return blocked(request, "bridge_missing_or_expired");

  logTaichungLineHandoff("coordinator_signin_started", bridge);
  try {
    const callbackUrl = new URL(
      "/api/line-oauth/taichung/complete",
      request.url,
    ).toString();
    const responseUrl = await signIn("line-taichung-coordinator", {
      redirect: false,
      redirectTo: callbackUrl,
    });
    const destination = new URL(String(responseUrl), request.url);
    if (
      destination.origin !== request.nextUrl.origin ||
      destination.pathname !== "/api/line-oauth/taichung/complete"
    ) {
      return blocked(request, "coordinator_signin_failed");
    }

    logTaichungLineHandoff("coordinator_signin_request_sent", bridge);
    return NextResponse.redirect(destination, 303);
  } catch {
    return blocked(request, "coordinator_signin_failed");
  }
}
