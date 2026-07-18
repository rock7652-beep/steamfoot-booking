import { NextRequest, NextResponse } from "next/server";
import { createTaichungAuthorization, TaichungOAuthError } from "@/lib/line-oauth/taichung-coordinator";

function callbackUrl(request: NextRequest): string {
  // The registered LINE callback is single and production-owned.  This is the
  // only redirect URI the Taiwan coordinator is allowed to issue.
  return `${request.nextUrl.origin}/api/auth/callback/line`;
}

export async function GET(request: NextRequest) {
  try {
    const authorizationUrl = await createTaichungAuthorization(callbackUrl(request));
    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    const message = error instanceof TaichungOAuthError ? error.message : "LINE OAuth could not start";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
