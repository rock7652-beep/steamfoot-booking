import { prisma } from "@/lib/db";
import { isPreviewExternalIntegrationBlocked } from "@/lib/runtime-env";
import { notifyTrialApplication } from "@/server/services/trial-application-notification";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (isPreviewExternalIntegrationBlocked()) return Response.json({ skipped: "preview" });
  if (!process.env.TRIAL_INTAKE_WEBHOOK_URL && !process.env.RESEND_API_KEY)
    return Response.json({ skipped: "not-configured" });
  // Recover response loss and stale SENDING leases. A successful supplement resets PENDING.
  const records = await prisma.trialApplication.findMany({
    where: {
      notificationStatus: { in: ["FAILED", "PENDING", "DISABLED", "SENDING"] },
      updatedAt: { lt: new Date(Date.now() - 10 * 60_000) },
    },
    select: { id: true, revision: true, notificationStatus: true, updatedAt: true },
    orderBy: { updatedAt: "asc" }, take: 3,
  });
  let sent = 0, failed = 0;
  for (const record of records) {
    const where = { id: record.id, revision: record.revision, notificationStatus: record.notificationStatus, updatedAt: record.updatedAt };
    const claim = await prisma.trialApplication.updateMany({ where, data: { notificationStatus: "SENDING" } });
    if (!claim.count) continue;
    const status = await notifyTrialApplication(record.id);
    await prisma.trialApplication.updateMany({
      where: { id: record.id, revision: record.revision, notificationStatus: "SENDING" },
      data: { notificationStatus: status },
    });
    if (status === "SENT") sent++; else failed++;
  }
  return Response.json({ sent, failed });
}
