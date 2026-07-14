import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveLineReferralEntry } from "@/server/queries/line-referral-entry";

const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: REFERRAL_COOKIE_MAX_AGE,
};

export async function GET(request: NextRequest) {
  const storeSlug =
    request.headers.get("x-store-slug") ??
    request.cookies.get("store-slug")?.value ??
    null;
  const result = await resolveLineReferralEntry(
    storeSlug,
    request.nextUrl.searchParams.get("ref"),
  );

  if (result.status !== "READY") {
    return invalidEntryResponse(result.status);
  }

  const source =
    request.nextUrl.searchParams.get("source")?.trim().slice(0, 100) ||
    "line-entry";
  try {
    await prisma.referralEvent.createMany({
      data: [
        {
          storeId: result.storeId,
          referrerId: result.referrerId,
          type: "LINK_CLICK",
          source,
        },
        {
          storeId: result.storeId,
          referrerId: result.referrerId,
          type: "LINE_ENTRY",
          source,
        },
      ],
    });
  } catch (error) {
    console.error("[line-entry] referral event write failed", {
      storeId: result.storeId,
      referrerId: result.referrerId,
      error,
    });
  }

  const response = NextResponse.redirect(result.lineOfficialUrl, 307);
  response.cookies.set("pending-ref", result.referrerId, COOKIE_OPTIONS);
  response.cookies.set(
    "referral-visitor-token",
    crypto.randomUUID(),
    COOKIE_OPTIONS,
  );
  return response;
}

function invalidEntryResponse(
  status: Exclude<
    Awaited<ReturnType<typeof resolveLineReferralEntry>>["status"],
    "READY"
  >,
): Response {
  const message =
    status === "LINE_NOT_CONFIGURED"
      ? "此店家尚未完成 LINE 設定，暫時無法使用推薦分享。"
      : status === "STORE_UNAVAILABLE"
        ? "此店家目前未開放推薦分享。"
        : "這個推薦連結無效，請向分享者索取新的連結。";

  return new Response(
    `<!doctype html><html lang="zh-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>無法開啟推薦連結</title></head><body><main><h1>無法開啟推薦連結</h1><p>${message}</p></main></body></html>`,
    {
      status: 400,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "private, no-store",
      },
    },
  );
}
