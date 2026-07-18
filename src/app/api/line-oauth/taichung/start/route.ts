import { NextRequest, NextResponse } from "next/server";
import { createTaichungAuthorization, TaichungOAuthError } from "@/lib/line-oauth/taichung-coordinator";
import { resolveTaichungCallbackUrl } from "@/lib/line-oauth/callback-url";

export async function GET(request: NextRequest) {
  try {
    const callbackUrl = resolveTaichungCallbackUrl(request.nextUrl.host);
    if (!callbackUrl) return NextResponse.json({ error: "Invalid LINE OAuth host" }, { status: 400 });
    const authorizationUrl = await createTaichungAuthorization(callbackUrl);
    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    const message = error instanceof TaichungOAuthError ? error.message : "LINE OAuth could not start";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
