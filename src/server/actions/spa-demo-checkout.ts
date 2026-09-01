"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { spaPrisma } from "@/lib/spa-db";
import {
  SPA_DEMO_LIVE_FLOW_BOOKING_IDS,
  SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID,
  SPA_DEMO_LIVE_FLOW_STORED_WALLET_ID,
  SPA_DEMO_STORE,
} from "@/lib/spa-demo-store";
import { requireSpaStore } from "@/lib/industry-module-server";

const settlementSchema = z.enum(["CASH", "CREDIT_CARD", "STORED_VALUE", "PACKAGE"]);
const inputSchema = z.object({ bookingId: z.enum(SPA_DEMO_LIVE_FLOW_BOOKING_IDS), settlement: settlementSchema });
type Settlement = z.infer<typeof settlementSchema>;

const SETTLEMENT_LABEL: Record<Settlement, string> = {
  CASH: "現金",
  CREDIT_CARD: "刷卡",
  STORED_VALUE: "儲值金",
  PACKAGE: "扣療程",
};

function revalidateSpaViews() {
  revalidatePath("/liff/design-preview");
  revalidatePath("/liff/manager-preview");
  revalidatePath("/liff/staff-preview");
  revalidatePath("/dashboard/bookings");
  revalidatePath("/staff-schedule");
}

function paymentMethod(settlement: Settlement) {
  if (settlement === "PACKAGE") return "ENTITLEMENT" as const;
  return settlement;
}

async function settleBookings({
  bookingIds,
  settlement,
  scope,
}: {
  bookingIds: readonly string[];
  settlement: Settlement;
  scope: "GROUP" | "INDIVIDUAL";
}) {
  return spaPrisma.$transaction(async (tx) => {
    for (const bookingId of bookingIds) {
      await tx.$queryRaw`SELECT id FROM "SpaBooking" WHERE id = ${bookingId} FOR UPDATE`;
    }
    const bookings = await tx.spaBooking.findMany({
      where: { id: { in: [...bookingIds] }, storeId: SPA_DEMO_STORE.id, status: { not: "CANCELLED" } },
      orderBy: { guestIndex: "asc" },
    });
    if (bookings.length !== bookingIds.length) throw new Error("SPA_DEMO_GROUP_INCOMPLETE");
    if (bookings.some((booking) => booking.status === "COMPLETED")) throw new Error("SPA_DEMO_ALREADY_COMPLETED");
    if (bookings.some((booking) => !(["PENDING", "CONFIRMED"] as const).includes(booking.status as "PENDING" | "CONFIRMED"))) {
      throw new Error("SPA_DEMO_STATUS_INVALID");
    }
    const customerId = bookings[0].customerId;
    if (bookings.some((booking) => booking.customerId !== customerId)) throw new Error("SPA_DEMO_GROUP_INCOMPLETE");

    const total = bookings.reduce((sum, booking) => sum + Number(booking.totalPriceSnapshot), 0);
    let storedValueBalance: number | null = null;
    let packageRemainingSessions: number | null = null;

    if (settlement === "STORED_VALUE") {
      const wallet = await tx.spaStoredValueWallet.findUnique({
        where: { storeId_customerId: { storeId: SPA_DEMO_STORE.id, customerId } },
      });
      if (!wallet || wallet.status !== "ACTIVE") throw new Error("SPA_DEMO_STORED_WALLET_MISSING");
      await tx.$queryRaw`SELECT id FROM "SpaStoredValueWallet" WHERE id = ${wallet.id} FOR UPDATE`;
      const locked = await tx.spaStoredValueWallet.findUnique({ where: { id: wallet.id } });
      const balance = Number(locked?.balance ?? 0);
      if (balance < total) throw new Error("SPA_DEMO_STORED_VALUE_INSUFFICIENT");
      storedValueBalance = balance - total;
      await tx.spaStoredValueWallet.update({ where: { id: wallet.id }, data: { balance: storedValueBalance } });
    }

    if (settlement === "PACKAGE") {
      await tx.$queryRaw`SELECT id FROM "SpaEntitlement" WHERE id = ${SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID} FOR UPDATE`;
      const entitlement = await tx.spaEntitlement.findFirst({
        where: {
          id: SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID,
          storeId: SPA_DEMO_STORE.id,
          customerId,
          status: "ACTIVE",
          remainingUses: { gte: bookings.length },
        },
      });
      if (!entitlement) throw new Error("SPA_DEMO_PACKAGE_WALLET_EMPTY");
      packageRemainingSessions = entitlement.remainingUses - bookings.length;
      await tx.spaEntitlement.update({
        where: { id: entitlement.id },
        data: {
          remainingUses: packageRemainingSessions,
          status: packageRemainingSessions === 0 ? "EXHAUSTED" : "ACTIVE",
        },
      });
    }

    let runningBalance = settlement === "STORED_VALUE"
      ? Number((await tx.spaStoredValueWallet.findUnique({ where: { id: SPA_DEMO_LIVE_FLOW_STORED_WALLET_ID } }))?.balance ?? 0) + total
      : 0;
    const paidAt = new Date();
    for (const booking of bookings) {
      const amount = Number(booking.totalPriceSnapshot);
      const paymentId = `spa-payment-${booking.id}`;
      await tx.spaPayment.create({
        data: {
          id: paymentId,
          storeId: SPA_DEMO_STORE.id,
          customerId,
          bookingId: booking.id,
          revenueStaffId: booking.revenueStaffId ?? booking.serviceStaffId,
          grossAmount: amount,
          netAmount: settlement === "PACKAGE" ? 0 : amount,
          paymentMethod: paymentMethod(settlement),
          status: "SUCCESS",
          quantity: 1,
          paidAt,
          note: `SPA Demo ${scope === "GROUP" ? "整組" : `同行者 ${booking.guestIndex}`}完成服務`,
        },
      });

      if (settlement === "STORED_VALUE") {
        runningBalance -= amount;
        await tx.spaStoredValueEntry.create({
          data: {
            id: `spa-ledger-${booking.id}`,
            walletId: SPA_DEMO_LIVE_FLOW_STORED_WALLET_ID,
            storeId: SPA_DEMO_STORE.id,
            customerId,
            bookingId: booking.id,
            paymentId,
            entryType: "DEBIT",
            amount: -amount,
            balanceAfter: runningBalance,
            note: booking.serviceNameSnapshot,
          },
        });
      }

      if (settlement === "PACKAGE") {
        await tx.spaEntitlementUse.create({
          data: {
            id: `spa-entitlement-use-${booking.id}`,
            storeId: SPA_DEMO_STORE.id,
            entitlementId: SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID,
            bookingId: booking.id,
            uses: 1,
            status: "COMPLETED",
            completedAt: paidAt,
          },
        });
      }

      const partySize = Number(booking.notes?.match(/\|party=(\d+)/)?.[1] ?? bookings.length);
      const label = settlement === "PACKAGE" ? "扣療程 1 次" : SETTLEMENT_LABEL[settlement];
      await tx.spaBooking.update({
        where: { id: booking.id },
        data: {
          status: "COMPLETED",
          completedAt: paidAt,
          notes: `SPA_DEMO_LIVE_FLOW|party=${partySize}|guest=${booking.guestIndex}|checkout=${scope}|settlement=${settlement}|label=${label}|amount=${settlement === "PACKAGE" ? 0 : amount}`,
        },
      });
    }

    return {
      bookingIds: bookings.map((booking) => booking.id),
      storedValueBalance,
      packageRemainingSessions,
      amount: settlement === "PACKAGE" ? 0 : total,
    };
  });
}

function settlementError(error: unknown, group: boolean) {
  const message = error instanceof Error ? error.message : "";
  const subject = group ? "整組" : "此位";
  if (message === "SPA_DEMO_STORED_VALUE_INSUFFICIENT") return `儲值金餘額不足，${subject}尚未結帳`;
  if (message === "SPA_DEMO_PACKAGE_WALLET_EMPTY") return `療程剩餘次數不足，${subject}尚未扣次`;
  if (message === "SPA_DEMO_ALREADY_COMPLETED") return `${subject}服務已完成，請勿重複結帳`;
  if (message === "SPA_DEMO_GROUP_INCOMPLETE") return "同行預約資料不完整，整組未變更";
  if (message === "SPA_DEMO_STATUS_INVALID") return "同行預約狀態不一致，整組未變更";
  return `目前無法完成${group ? "結帳" : "此位結帳"}，請重新整理後再試`;
}

export async function completeSpaDemoBooking(input: unknown) {
  if (process.env.VERCEL_ENV === "production") return { success: false as const, error: "Demo 結帳不在正式站開放" };
  await requireSpaStore(SPA_DEMO_STORE.id);
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "結帳資料不完整" };

  const selected = await spaPrisma.spaBooking.findFirst({ where: { id: parsed.data.bookingId, storeId: SPA_DEMO_STORE.id } });
  if (!selected) return { success: false as const, error: "Demo 預約不存在或資料隔離檢查失敗" };
  const partySize = Number(selected.notes?.match(/\|party=(\d+)/)?.[1] ?? 1);
  const bookingIds = SPA_DEMO_LIVE_FLOW_BOOKING_IDS.slice(0, partySize);

  try {
    const result = await settleBookings({ bookingIds, settlement: parsed.data.settlement, scope: "GROUP" });
    revalidateSpaViews();
    return {
      success: true as const,
      data: {
        ...result,
        settlementLabel: parsed.data.settlement === "PACKAGE" ? `扣療程 ${partySize} 次` : SETTLEMENT_LABEL[parsed.data.settlement],
        people: partySize,
      },
    };
  } catch (error) {
    return { success: false as const, error: settlementError(error, true) };
  }
}

export async function completeSpaDemoGuestBooking(input: unknown) {
  if (process.env.VERCEL_ENV === "production") return { success: false as const, error: "Demo 結帳不在正式站開放" };
  await requireSpaStore(SPA_DEMO_STORE.id);
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "結帳資料不完整" };

  const booking = await spaPrisma.spaBooking.findFirst({ where: { id: parsed.data.bookingId, storeId: SPA_DEMO_STORE.id } });
  if (!booking) return { success: false as const, error: "Demo 預約不存在或資料隔離檢查失敗" };
  if (booking.guestIndex > 1 && (parsed.data.settlement === "STORED_VALUE" || parsed.data.settlement === "PACKAGE")) {
    return { success: false as const, error: "同行者尚未連結會員，請改用現金或刷卡" };
  }

  try {
    const result = await settleBookings({ bookingIds: [booking.id], settlement: parsed.data.settlement, scope: "INDIVIDUAL" });
    revalidateSpaViews();
    return {
      success: true as const,
      data: {
        bookingId: booking.id,
        settlementLabel: parsed.data.settlement === "PACKAGE" ? "扣療程 1 次" : SETTLEMENT_LABEL[parsed.data.settlement],
        amount: result.amount,
        storedValueBalance: result.storedValueBalance,
        packageRemainingSessions: result.packageRemainingSessions,
      },
    };
  } catch (error) {
    return { success: false as const, error: settlementError(error, false) };
  }
}
