import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { toLocalDateStr } from "@/lib/date-utils";
import { notifyStoreManagerOnLine } from "@/server/services/store-manager-line-notifications";

const SERVICE_DURATION_MINUTES = 60;
const REMINDER_GRACE_MINUTES = 60;
const LOOKBACK_DAYS = 2;

function bookingStartAtTaipei(bookingDate: Date, slotTime: string): Date | null {
  const match = /^(\d{2}):(\d{2})$/.exec(slotTime);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return new Date(Date.UTC(
    bookingDate.getUTCFullYear(),
    bookingDate.getUTCMonth(),
    bookingDate.getUTCDate(),
    hour - 8,
    minute,
  ));
}

function reminderDueAt(bookingDate: Date, slotTime: string): Date | null {
  const start = bookingStartAtTaipei(bookingDate, slotTime);
  return start
    ? new Date(start.getTime() + (SERVICE_DURATION_MINUTES + REMINDER_GRACE_MINUTES) * 60 * 1000)
    : null;
}

async function claimNotification(storeId: string, eventKey: string): Promise<string | null> {
  try {
    const claim = await prisma.digitalButlerExecutionLog.create({
      data: {
        storeId,
        eventKey,
        eventType: "INCOMPLETE_SERVICE_REMINDER",
        outcome: "CLAIMED",
      },
      select: { id: true },
    });
    return claim.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
    throw error;
  }
}

async function releaseClaim(claimId: string): Promise<void> {
  await prisma.digitalButlerExecutionLog.delete({ where: { id: claimId } }).catch(() => undefined);
}

export interface IncompleteServiceReminderResult {
  scanned: number;
  due: number;
  sent: number;
  skipped: number;
  failed: number;
}

export async function runIncompleteServiceReminders(now = new Date()): Promise<IncompleteServiceReminderResult> {
  const todayTW = toLocalDateStr(now);
  const [year, month, day] = todayTW.split("-").map(Number);
  const earliestBookingDate = new Date(Date.UTC(year, month - 1, day - LOOKBACK_DAYS));
  const latestBookingDate = new Date(Date.UTC(year, month - 1, day + 1));

  const candidates = await prisma.booking.findMany({
    where: {
      bookingDate: { gte: earliestBookingDate, lt: latestBookingDate },
      bookingStatus: { in: ["PENDING", "CONFIRMED"] },
      store: {
        isDemo: false,
        operatingStatus: { in: ["ACTIVE", "TRIAL"] },
      },
    },
    select: {
      id: true,
      storeId: true,
      bookingDate: true,
      slotTime: true,
      customer: { select: { name: true } },
      store: { select: { slug: true } },
    },
    orderBy: [{ bookingDate: "asc" }, { slotTime: "asc" }],
    take: 300,
  });

  const result: IncompleteServiceReminderResult = {
    scanned: candidates.length,
    due: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  for (const candidate of candidates) {
    const dueAt = reminderDueAt(candidate.bookingDate, candidate.slotTime);
    if (!dueAt || dueAt.getTime() > now.getTime()) {
      result.skipped += 1;
      continue;
    }
    result.due += 1;

    const eventKey = `incomplete-service-reminder:${candidate.id}`;
    let claimId: string | null = null;
    try {
      claimId = await claimNotification(candidate.storeId, eventKey);
      if (!claimId) {
        result.skipped += 1;
        continue;
      }

      // Re-check after claiming so a concurrent completion, cancellation, or no-show wins.
      const stillIncomplete = await prisma.booking.findFirst({
        where: {
          id: candidate.id,
          storeId: candidate.storeId,
          bookingStatus: { in: ["PENDING", "CONFIRMED"] },
        },
        select: { id: true },
      });
      if (!stillIncomplete) {
        result.skipped += 1;
        await releaseClaim(claimId);
        continue;
      }

      const delivery = await notifyStoreManagerOnLine({
        type: "INCOMPLETE_SERVICE_REMINDER",
        eventKey,
        storeId: candidate.storeId,
        storeSlug: candidate.store.slug,
        bookingId: candidate.id,
        customerName: candidate.customer.name,
        bookingDate: candidate.bookingDate.toISOString().slice(0, 10),
        slotTime: candidate.slotTime,
      });

      if (delivery.status === "sent") {
        result.sent += 1;
        if (delivery.failedCount > 0) result.failed += 1;
        await prisma.digitalButlerExecutionLog.update({
          where: { id: claimId },
          data: { outcome: delivery.failedCount > 0 ? "PARTIAL" : "SENT" },
        });
      } else if (delivery.status === "skipped") {
        result.skipped += 1;
        await releaseClaim(claimId);
      } else {
        result.failed += 1;
        await releaseClaim(claimId);
      }
    } catch (error) {
      result.failed += 1;
      if (claimId) await releaseClaim(claimId);
      console.error("[IncompleteServiceReminder] booking failed", {
        bookingId: candidate.id,
        storeId: candidate.storeId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return result;
}
