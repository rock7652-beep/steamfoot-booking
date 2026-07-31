import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseTaiwanDateToDbDate, toLocalDateStr } from "@/lib/date-utils";
import { HUMAN_SUPPORT_COMPLETION_ACTION_KEY } from "@/server/services/human-support-handoff";
import { notifyStoreManagerOnLine } from "@/server/services/store-manager-line-notifications";

export interface DailyActionDigestResult {
  storesScanned: number;
  storesNotified: number;
  storesSkipped: number;
  failed: number;
}

export function yesterdayBookingDateTaipei(now = new Date()): Date {
  const todayDate = parseTaiwanDateToDbDate(toLocalDateStr(now));
  todayDate.setUTCDate(todayDate.getUTCDate() - 1);
  return todayDate;
}

export function yesterdayIncompleteBookingWhere(
  storeId: string,
  now = new Date(),
): Prisma.BookingWhereInput {
  return {
    storeId,
    bookingDate: yesterdayBookingDateTaipei(now),
    bookingStatus: { in: ["PENDING", "CONFIRMED"] },
  };
}

export async function countYesterdayIncompleteServices(
  storeId: string,
  now = new Date(),
): Promise<number> {
  return prisma.booking.count({
    where: yesterdayIncompleteBookingWhere(storeId, now),
  });
}

export async function runDailyActionDigest(now = new Date()): Promise<DailyActionDigestResult> {
  const todayTW = toLocalDateStr(now);
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
      const [pendingPaymentCount, incompleteServiceCount, waitingSupportCount] = await Promise.all([
        prisma.transaction.count({
          where: {
            storeId: store.id,
            paymentStatus: "PENDING",
            paymentMethod: { in: ["TRANSFER", "UNPAID"] },
            status: "SUCCESS",
          },
        }),
        countYesterdayIncompleteServices(store.id, now),
        prisma.digitalButlerLead.count({
          where: {
            storeId: store.id,
            completionActionKey: HUMAN_SUPPORT_COMPLETION_ACTION_KEY,
            status: "NEW",
          },
        }),
      ]);

      if (pendingPaymentCount + incompleteServiceCount + waitingSupportCount === 0) {
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
        waitingSupportCount,
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
