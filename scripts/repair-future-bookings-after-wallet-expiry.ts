/**
 * One-time guarded repair for the four production bookings identified by the
 * 2026-08-28 read-only expiry audit.
 *
 * The script never changes booking date/time/people/status. It atomically:
 * 1) releases RESERVED WalletSession rows from the expired linked wallet(s),
 * 2) reserves the same number of sessions on a safe replacement wallet, and
 * 3) updates only Booking.customerPlanWalletId / servicePlanId.
 */
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { BookingStatus, Prisma, PrismaClient } from "@prisma/client";
import { allocateSessions, releaseSessions } from "../src/server/services/wallet-session";
import { toLocalDateStr } from "../src/lib/date-utils";

const prisma = new PrismaClient();
const EXPECTED_ANOMALY_COUNT = 4;
const EXPECTED_SET_SHA256 = "de56ea8b6bdc45450a11f503227abdeb694efc384d51ee61921cd875a1ceee60";
const pendingStatuses: BookingStatus[] = ["PENDING", "CONFIRMED"];

function bookingSetHash(ids: string[]): string {
  return createHash("sha256").update(`${[...ids].sort().join(",")},`).digest("hex");
}

async function main() {
  if (!process.argv.includes("--execute") || !process.argv.includes("--owner-authorized")) {
    throw new Error("ABORTED: both --execute and --owner-authorized are required");
  }

  const today = toLocalDateStr();
  const todayDate = new Date(`${today}T00:00:00.000Z`);
  const result = await prisma.$transaction(async (tx) => {
    const bookings = await tx.booking.findMany({
      where: {
        bookingDate: { gte: todayDate },
        bookingStatus: { in: pendingStatuses },
        customerPlanWalletId: { not: null },
        isMakeup: false,
        store: { isDemo: false },
      },
      include: {
        customerPlanWallet: true,
        walletSessions: { where: { status: "RESERVED" }, select: { id: true, walletId: true } },
        customer: {
          select: {
            id: true,
            name: true,
            planWallets: {
              where: { status: "ACTIVE" },
              include: {
                plan: { select: { id: true, name: true } },
                sessions: { where: { status: "AVAILABLE" }, select: { id: true } },
              },
            },
          },
        },
        store: { select: { id: true, name: true } },
      },
      orderBy: [{ bookingDate: "asc" }, { slotTime: "asc" }],
    });

    const anomalies = bookings.filter((booking) => {
      const expiry = booking.customerPlanWallet?.expiryDate;
      return expiry !== null && expiry !== undefined && booking.bookingDate > expiry;
    });
    if (
      anomalies.length !== EXPECTED_ANOMALY_COUNT ||
      bookingSetHash(anomalies.map((booking) => booking.id)) !== EXPECTED_SET_SHA256
    ) {
      throw new Error("ABORTED: anomaly set changed after audit; no rows were modified");
    }

    const plans = anomalies.map((booking) => {
      const currentWallet = booking.customerPlanWallet!;
      const candidates = booking.customer.planWallets.filter((wallet) =>
        wallet.id !== currentWallet.id &&
        wallet.storeId === booking.storeId &&
        wallet.startDate <= booking.bookingDate &&
        (!wallet.expiryDate || wallet.expiryDate >= booking.bookingDate) &&
        wallet.sessions.length >= booking.people,
      );
      const samePlan = candidates.filter((wallet) => wallet.planId === currentWallet.planId);
      const chosen = samePlan.length === 1
        ? samePlan[0]
        : candidates.length === 1
          ? candidates[0]
          : null;
      if (!chosen) {
        throw new Error(`ABORTED: booking ${booking.id} has no unambiguous safe replacement`);
      }
      return { booking, chosen };
    });

    const repaired: Array<Record<string, unknown>> = [];
    for (const { booking, chosen } of plans) {
      const released = await releaseSessions(tx, booking.id);
      const allocated = await allocateSessions(tx, chosen.id, booking.id, booking.people);
      if (allocated.allocated !== booking.people) {
        throw new Error(`ABORTED: booking ${booking.id} could not reserve ${booking.people} sessions`);
      }
      await tx.booking.update({
        where: { id: booking.id },
        data: { customerPlanWalletId: chosen.id, servicePlanId: chosen.planId },
      });
      repaired.push({
        bookingId: booking.id,
        store: booking.store.name,
        customerName: booking.customer.name,
        bookingDate: booking.bookingDate.toISOString().slice(0, 10),
        slotTime: booking.slotTime,
        people: booking.people,
        releasedSessions: released.released,
        allocatedSessions: allocated.allocated,
        fromWalletId: booking.customerPlanWalletId,
        toWalletId: chosen.id,
        toPlan: chosen.plan.name,
        toExpiryDate: chosen.expiryDate?.toISOString().slice(0, 10) ?? null,
      });
    }
    return repaired;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10_000,
    timeout: 30_000,
  });

  await writeFile(
    "expired-booking-wallet-repair-result.json",
    JSON.stringify({ executedAtTaipeiDate: today, repairedCount: result.length, repaired: result }, null, 2),
  );
  console.log(JSON.stringify({ repairedCount: result.length }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "repair failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
