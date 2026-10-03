import { revalidatePath, revalidateTag } from "next/cache";
import { calculateMarketingUsage, getMarketingUsage, MARKETING_USAGE_TAG } from "@/lib/marketing-usage-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.VERCEL_ENV !== "production") return Response.json({ ok: true, skipped: true });
  try {
    // Verify the database is available before invalidating the last good cache.
    const snapshot = await calculateMarketingUsage();
    revalidateTag(MARKETING_USAGE_TAG, "max");
    await getMarketingUsage();
    revalidatePath("/pricing/business");
    return Response.json({ ok: true, asOf: snapshot.asOf });
  } catch {
    console.error("[MarketingUsageCron] Refresh failed; previous snapshot retained");
    return Response.json({ ok: false }, { status: 500 });
  }
}
