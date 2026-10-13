import { prisma } from "@/lib/db";
import { cancelEcpayAgreementIfEligible } from "@/server/services/ecpay-recurring-cancel";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const candidates = await prisma.ecpayRecurringAgreement.findMany({
      where: { status: "CANCEL_REQUESTED" },
      orderBy: { cancelRequestedAt: "asc" },
      take: 25,
      select: { id: true, successfulPaymentCount: true, cancelAfterSuccessCount: true, initialTermMonths: true },
    });
    const eligible = candidates.filter(item => item.successfulPaymentCount >= (item.cancelAfterSuccessCount ?? item.initialTermMonths));
    let cancelled = 0;
    const failures: string[] = [];
    for (const item of eligible) {
      try {
        if (await cancelEcpayAgreementIfEligible(item.id)) cancelled++;
      } catch (error) {
        failures.push(item.id);
        console.error("[Ecpay recurring cancellation retry] failed", item.id, error instanceof Error ? error.message : String(error));
      }
    }
    return Response.json({ checked: candidates.length, eligible: eligible.length, cancelled, failed: failures.length });
  } catch (error) {
    console.error("[Ecpay recurring cancellation cron] failed", error instanceof Error ? error.message : String(error));
    return Response.json({ error: "Cancellation reconciliation failed" }, { status: 500 });
  }
}
