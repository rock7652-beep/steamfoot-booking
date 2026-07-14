import { buildLineShareUrl, buildShareText } from "@/lib/share";
import { getReferralShareContext } from "@/server/queries/referral-share-context";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const context = await getReferralShareContext({
    customerId: "staging-cust-001",
    storeId: "staging-store",
    storeSlug: "staging",
  });

  if (!context.available) {
    return NextResponse.json(context, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const referralUrl = `${origin}${context.referralUrl}`;
  const shareText = buildShareText({
    storeName: context.storeName,
    url: referralUrl,
    template: context.shareTemplate,
  });

  return NextResponse.json({
    storeName: context.storeName,
    referralUrl,
    shareTemplate: context.shareTemplate,
    shareText,
    lineShareUrl: buildLineShareUrl(shareText),
  });
}
