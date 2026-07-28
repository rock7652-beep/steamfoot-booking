import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseTaiwanDateToDbDate, toLocalDateStr } from "@/lib/date-utils";
import { notifyStoreManagerOnLine } from "@/server/services/store-manager-line-notifications";

export interface DailyActionDigestResult {
  storesScanned: number;
  storesNotified: number;
  storesSkipped: number;
  failed: number;
}

export async function runDailyActionDigest(): Promise<DailyActionDigestResult> {
  const todayTW = toLocalDateStr();
  const todayDate = parseTaiwanDateToDbDate(todayTW);
  const stores = await prisma.store.findMany({
    where: {
      isDemo: false,
      operatingStatus: { in: ["ACTIVE", "TRIAL"] },
    },
    select: { id: true, slug: true },
  });

  const result: DailyActionDigestResult = {
    storesScanned: stores.length,
    storesNotified: 0,
    storesSkipped: 0,
    failed: 0,
  };

  for (const store of stores) {
    const eventKey = `daily-action-digest:${store.id}:${todayTW}`;
    let claimId: string | null = null;

    try {
      const [pendingPaymentCount, incompleteServiceCount] = await Promise.all([
        prisma.transaction.count({
          where: {
            storeId: store.id,
            paymentStatus: "PENDING",
            paymentMethod: { in: ["TRANSFER", "UNPAID"] },
            status: "SUCCESS",
          },
        }),
        prisma.booking.count({
          where: {
            storeId: store.id,
            bookingDate: { lt: todayDate },
            bookingStatus: { in: ["PENDING", "CONFIRMED"] },
          },
        }),
      ]);

      if (pendingPaymentCount + incompleteServiceCount === 0) {
        result.storesSkipped += 1;
        continue;
      }

      try {
        const claim = await prisma.digitalButlerExecutionLog.create({
          data: {
            storeId: store.id,
            eventKey,
            eventType: "DAILY_ACTION_DIGEST",
            outcome: "CLAIMED",
          },
          select: { id: true },
        });
        claimId = claim.id;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          result.storesSkipped += 1;
          continue;
        }
        throw error;
      }

      const delivery = await notifyStoreManagerOnLine({
        type: "DAILY_ACTION_DIGEST",
        eventKey,
        storeId: store.id,
        storeSlug: store.slug,
        pendingPaymentCount,
        incompleteServiceCount,
      });

      if (delivery.status === "sent") {
        result.storesNotified += 1;
        if (delivery.failedCount > 0) result.failed += 1;
        await prisma.digitalButlerExecutionLog.update({
          where: { id: claimId },
          data: { outcome: delivery.failedCount > 0 ? "PARTIAL" : "SENT" },
        });
      } else if (delivery.status === "skipped") {
        result.storesSkipped += 1;
        await prisma.digitalButlerExecutionLog.delete({ where: { id: claimId } });
      } else {
        result.failed += 1;
        await prisma.digitalButlerExecutionLog.delete({ where: { id: claimId } });
      }
    } catch (error) {
      result.failed += 1;
      if (claimId) {
        await prisma.digitalButlerExecutionLog
          .delete({ where: { id: claimId } })
          .catch(() => undefined);
      }
      console.error("[DailyActionDigest] store failed", {
        storeId: store.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return result;
}
