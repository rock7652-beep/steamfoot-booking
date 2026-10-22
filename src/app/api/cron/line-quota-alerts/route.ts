import { runLineQuotaMonitor } from "@/server/services/line-quota-monitor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runLineQuotaMonitor();
    return Response.json(result, { status: result.failed ? 503 : 200 });
  } catch {
    return Response.json({ error: "LINE 額度與 Email 通知檢查失敗" }, { status: 500 });
  }
}
