import { purgeExpiredBrandMemory } from "@/server/services/brand-ai-memory";
import { isPreviewExternalIntegrationBlocked } from "@/lib/runtime-env";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (isPreviewExternalIntegrationBlocked())
    return Response.json({ error: "Production only" }, { status: 403 });
  try {
    return Response.json({ deleted: await purgeExpiredBrandMemory() });
  } catch {
    return Response.json({ error: "Memory cleanup failed" }, { status: 500 });
  }
}
