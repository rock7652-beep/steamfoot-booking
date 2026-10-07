import { maintainAuditRetention } from "@/server/services/audit-retention";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (process.env.VERCEL_ENV !== "production")
    return Response.json({ error: "Production only" }, { status: 403 });
  try { return Response.json(await maintainAuditRetention()); }
  catch { return Response.json({ error: "Retention failed" }, { status: 500 }); }
}
