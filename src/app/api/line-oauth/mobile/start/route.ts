import { NextRequest, NextResponse } from "next/server";
import { resolveTaichungCallbackUrl } from "@/lib/line-oauth/callback-url";
import {
  createMobileAuthorization,
  MobileLineOAuthError,
} from "@/lib/line-oauth/mobile-coordinator";

export async function GET(request: NextRequest) {
  const storeSlug = request.nextUrl.searchParams.get("storeSlug")?.trim() ?? "";
  const returnPath = request.nextUrl.searchParams.get("returnTo") ?? "";
  try {
    const callbackUrl = resolveTaichungCallbackUrl(request.nextUrl.host);
    if (!callbackUrl) {
      return NextResponse.json({ error: "Invalid LINE OAuth host" }, { status: 400 });
    }
    const authorizationUrl = await createMobileAuthorization({
      callbackUrl,
      storeSlug,
      returnPath,
    });
    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    const message = error instanceof MobileLineOAuthError
      ? error.message
      : "LINE OAuth could not start";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
