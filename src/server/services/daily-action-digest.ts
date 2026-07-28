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
    try {
      const [pendingPaymentCount, incompleteServiceCount] = await Promise.all([
        prisma.transaction.count({
          where: {
            storeId: store.id,
            paymentStatus: "PENDING",
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

      const delivery = await notifyStoreManagerOnLine({
        type: "DAILY_ACTION_DIGEST",
        eventKey: `daily-action-digest:${store.id}:${todayTW}`,
        storeId: store.id,
        storeSlug: store.slug,
        pendingPaymentCount,
        incompleteServiceCount,
      });

      if (delivery.status === "sent") result.storesNotified += 1;
      else if (delivery.status === "skipped") result.storesSkipped += 1;
      else result.failed += 1;
    } catch (error) {
      result.failed += 1;
      console.error("[DailyActionDigest] store failed", {
        storeId: store.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return result;
}
