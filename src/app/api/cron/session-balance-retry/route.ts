import { retrySessionBalanceNotifications } from "@/server/services/session-balance-notifications";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.VERCEL_ENV !== "production") {
    return Response.json({ error: "Production only" }, { status: 403 });
  }
  try {
    const notifications = await retrySessionBalanceNotifications();
    const { retryQueuedLineQuotaEmails } = await import("@/server/services/line-quota-monitor");
    const emailRetries = await retryQueuedLineQuotaEmails();
    return Response.json({ ...notifications, emailRetries });
  } catch {
    console.error("[SessionBalanceNotification] retry run failed");
    return Response.json({ error: "Retry failed" }, { status: 500 });
  }
}
