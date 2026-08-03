import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { OAUTH_TEMP_COOKIE_NAME } from "@/lib/oauth-temp-session";
import { getOAuthTempSession } from "@/lib/server/oauth-temp-session";
import { logTaichungLineHandoff } from "@/lib/line-oauth/taichung-handoff-log";
import { completeTaichungProviderLineOwnershipProof } from "@/server/actions/taichung-provider-line-finalize";

/**
 * Server-side completion after customer-phone sign-in. The authenticated
 * session and signed OAuth temp context are both present in this request, so
 * no browser bridge cookie or client-side effect participates in binding.
 */
export async function GET(request: NextRequest) {
  const customerId = request.nextUrl.searchParams.get("customerId") ?? "";
  const [session, tempSession] = await Promise.all([auth(), getOAuthTempSession()]);
  const completed = await completeTaichungProviderLineOwnershipProof({
    customerId,
    session,
    tempSession,
  });

  if (completed.status === "rejected") {
    logTaichungLineHandoff("finalize_guard_rejected", {
      attemptId: tempSession?.attemptId,
      customerId,
      storeId: tempSession?.storeId,
      errorCode: completed.error,
    });
    const errorUrl = new URL("/oauth-confirm/finalize", request.url);
    errorUrl.searchParams.set("error", completed.error);
    return NextResponse.redirect(errorUrl, 303);
  }

  logTaichungLineHandoff("finalize_guard_passed", completed.completion);
  logTaichungLineHandoff("completion_writer_created", completed.completion);
  const response = NextResponse.redirect(new URL("/s/taichung/book", request.url), 303);
  // Clear the temp context only after the transaction has committed. Guard and
  // writer failures leave it available for an explicit safe retry.
  response.cookies.delete(OAUTH_TEMP_COOKIE_NAME);
  logTaichungLineHandoff("final_redirect_success", completed.completion);
  return response;
}
