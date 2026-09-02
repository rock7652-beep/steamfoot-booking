/**
 * One-time production audit: future PACKAGE_SESSION booking/wallet integrity.
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
  const storeSlug = process.env.AUDIT_STORE_SLUG ?? "zhubei";

  const bookings = await prisma.booking.findMany({
    where: {
      bookingDate: { gte: todayDate },
      bookingStatus: { in: ["PENDING", "CONFIRMED"] },
      bookingType: "PACKAGE_SESSION",
      isMakeup: false,
      store: { isDemo: false, slug: storeSlug },
    },
    select: {
      id: true,
      bookingDate: true,
      slotTime: true,
      bookingStatus: true,
      bookedByType: true,
      people: true,
      makeupCreditLinks: { select: { makeupCreditId: true } },
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
              plan: { select: { name: true, category: true } },
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
          customerId: true,
          storeId: true,
          startDate: true,
          expiryDate: true,
          status: true,
          remainingSessions: true,
          plan: { select: { name: true, category: true } },
          sessions: {
            where: { status: "RESERVED" },
            select: { bookingId: true },
          },
        },
      },
    },
    orderBy: [{ bookingDate: "asc" }, { slotTime: "asc" }],
  });

  const anomalies = bookings.flatMap((booking) => {
    const wallet = booking.customerPlanWallet;
    const walletPeople = Math.max(
      0,
      booking.people - booking.makeupCreditLinks.length,
    );
    const reasons: string[] = [];

    if (!wallet) {
      reasons.push("MISSING_LINKED_WALLET");
    } else {
      if (wallet.customerId !== booking.customer.id) reasons.push("WALLET_CUSTOMER_MISMATCH");
      if (wallet.storeId !== booking.store.id) reasons.push("WALLET_STORE_MISMATCH");
      if (wallet.status !== "ACTIVE") reasons.push("WALLET_NOT_ACTIVE");
      if (wallet.remainingSessions < walletPeople) reasons.push("INSUFFICIENT_REMAINING");
      if (wallet.startDate > booking.bookingDate) reasons.push("BOOKING_BEFORE_WALLET_START");
      if (wallet.expiryDate && booking.bookingDate > wallet.expiryDate) reasons.push("BOOKING_AFTER_WALLET_EXPIRY");
      const reservedForBooking = wallet.sessions.filter(
        (session) => session.bookingId === booking.id,
      ).length;
      if (reservedForBooking > 0 && reservedForBooking !== walletPeople) {
        reasons.push("RESERVED_SESSION_COUNT_MISMATCH");
      }

      // Mirrors the production day-list bug: the booking is valid and linked,
      // but the old row summary only counted PACKAGE-category wallets.
      const oldDayListTotal = booking.customer.planWallets
        .filter((candidate) => candidate.plan.category === "PACKAGE")
        .filter((candidate) => !candidate.expiryDate || candidate.expiryDate >= todayDate)
        .reduce((sum, candidate) => sum + candidate.remainingSessions, 0);
      if (oldDayListTotal === 0 && wallet.remainingSessions > 0) {
        reasons.push("DAY_LIST_FALSE_NO_VALID_PLAN");
      }
    }

    if (reasons.length === 0) return [];

    const replacementCandidates = booking.customer.planWallets
      .filter((candidate) =>
        candidate.id !== wallet?.id &&
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
      walletBackedPeople: walletPeople,
      reasons,
      customerId: booking.customer.id,
      customerName: booking.customer.name,
      customerPhone: booking.customer.phone,
      servicePlan: booking.servicePlan?.name ?? wallet?.plan.name ?? null,
      walletId: wallet?.id ?? null,
      walletStatus: wallet?.status ?? null,
      walletRemainingSessions: wallet?.remainingSessions ?? null,
      walletExpiryDate: wallet?.expiryDate ? dateOnly(wallet.expiryDate) : null,
      daysAfterExpiry: wallet?.expiryDate && booking.bookingDate > wallet.expiryDate
        ? differenceInCalendarDays(booking.bookingDate, wallet.expiryDate)
        : 0,
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
    JSON.stringify({ auditedAtTaipeiDate: today, storeSlug, scannedBookings: bookings.length, anomalyCount: anomalies.length, storeSummary, anomalies }, null, 2),
  );

  // Keep stdout free of customer PII; details live in the private 1-day artifact.
  console.log(JSON.stringify({ today, storeSlug, scannedBookings: bookings.length, anomalyCount: anomalies.length, storeSummary }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "future booking expiry audit failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
