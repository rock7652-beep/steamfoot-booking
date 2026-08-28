/**
 * One-time production audit: future bookings scheduled after their linked
 * plan wallet expiry date.
 *
 * READ ONLY. This script only calls Prisma findMany and writes a private
 * short-lived GitHub Actions artifact. It never mutates database records.
 */
import { writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { toLocalDateStr } from "../src/lib/date-utils";

const prisma = new PrismaClient();

function dateOnly(date: Date): string {
  // bookingDate / expiryDate are PostgreSQL DATE columns, so UTC slicing is safe.
  return date.toISOString().slice(0, 10);
}

function differenceInCalendarDays(later: Date, earlier: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / 86_400_000);
}

async function main() {
  const today = toLocalDateStr();
  const todayDate = new Date(`${today}T00:00:00.000Z`);

  const bookings = await prisma.booking.findMany({
    where: {
      bookingDate: { gte: todayDate },
      bookingStatus: { in: ["PENDING", "CONFIRMED"] },
      customerPlanWalletId: { not: null },
      isMakeup: false,
      store: { isDemo: false },
    },
    select: {
      id: true,
      bookingDate: true,
      slotTime: true,
      bookingStatus: true,
      bookedByType: true,
      people: true,
      store: { select: { id: true, name: true, slug: true } },
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          planWallets: {
            where: { status: "ACTIVE" },
            select: {
              id: true,
              storeId: true,
              startDate: true,
              expiryDate: true,
              remainingSessions: true,
              plan: { select: { name: true } },
              sessions: {
                where: { status: "AVAILABLE" },
                select: { id: true },
              },
            },
          },
        },
      },
      servicePlan: { select: { name: true } },
      customerPlanWallet: {
        select: {
          id: true,
          expiryDate: true,
          status: true,
          remainingSessions: true,
          plan: { select: { name: true } },
        },
      },
    },
    orderBy: [{ bookingDate: "asc" }, { slotTime: "asc" }],
  });

  const anomalies = bookings.flatMap((booking) => {
    const wallet = booking.customerPlanWallet;
    if (!wallet?.expiryDate || booking.bookingDate <= wallet.expiryDate) return [];

    const replacementCandidates = booking.customer.planWallets
      .filter((candidate) =>
        candidate.id !== wallet.id &&
        candidate.storeId === booking.store.id &&
        candidate.startDate <= booking.bookingDate &&
        (!candidate.expiryDate || candidate.expiryDate >= booking.bookingDate) &&
        candidate.sessions.length >= booking.people,
      )
      .map((candidate) => ({
        walletId: candidate.id,
        planName: candidate.plan.name,
        expiryDate: candidate.expiryDate ? dateOnly(candidate.expiryDate) : null,
        remainingSessions: candidate.remainingSessions,
        availableSessions: candidate.sessions.length,
      }));

    return [{
      store: booking.store.name,
      storeSlug: booking.store.slug,
      bookingId: booking.id,
      bookingDate: dateOnly(booking.bookingDate),
      slotTime: booking.slotTime,
      bookingStatus: booking.bookingStatus,
      bookedByType: booking.bookedByType,
      people: booking.people,
      customerId: booking.customer.id,
      customerName: booking.customer.name,
      customerPhone: booking.customer.phone,
      servicePlan: booking.servicePlan?.name ?? wallet.plan.name,
      walletId: wallet.id,
      walletStatus: wallet.status,
      walletRemainingSessions: wallet.remainingSessions,
      walletExpiryDate: dateOnly(wallet.expiryDate),
      daysAfterExpiry: differenceInCalendarDays(booking.bookingDate, wallet.expiryDate),
      replacementCandidates,
    }];
  });

  const storeSummary = Object.values(anomalies.reduce<Record<string, { store: string; count: number }>>(
    (summary, row) => {
      const current = summary[row.storeSlug] ?? { store: row.store, count: 0 };
      current.count += 1;
      summary[row.storeSlug] = current;
      return summary;
    },
    {},
  ));

  await writeFile(
    "future-bookings-after-wallet-expiry.json",
    JSON.stringify({ auditedAtTaipeiDate: today, scannedBookings: bookings.length, anomalyCount: anomalies.length, storeSummary, anomalies }, null, 2),
  );

  // Keep stdout free of customer PII; details live in the private 1-day artifact.
  console.log(JSON.stringify({ today, scannedBookings: bookings.length, anomalyCount: anomalies.length, storeSummary }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "future booking expiry audit failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
