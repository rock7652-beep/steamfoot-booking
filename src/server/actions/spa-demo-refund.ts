"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { spaPrisma } from "@/lib/spa-db";
import {
  SPA_DEMO_LIVE_FLOW_BOOKING_IDS,
  SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID,
  SPA_DEMO_LIVE_FLOW_STORED_WALLET_ID,
  SPA_DEMO_STORE,
} from "@/lib/spa-demo-store";
import { requireSpaStore } from "@/lib/industry-module-server";

const inputSchema = z.object({
  bookingId: z.enum(SPA_DEMO_LIVE_FLOW_BOOKING_IDS),
  scope: z.enum(["GROUP", "GUEST"]),
  reason: z.string().trim().min(2).max(80),
});

function revalidateSpaDemo() {
  revalidatePath("/liff/design-preview");
  revalidatePath("/liff/manager-preview");
  revalidatePath("/liff/staff-preview");
}

export async function refundSpaDemoCheckout(input: unknown) {
  if (process.env.VERCEL_ENV === "production") return { success: false as const, error: "Demo 退款不在正式站開放" };
  await requireSpaStore(SPA_DEMO_STORE.id);
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "退款資料不完整" };

  try {
    const selected = await spaPrisma.spaBooking.findFirst({
      where: { id: parsed.data.bookingId, storeId: SPA_DEMO_STORE.id, status: "COMPLETED" },
    });
    if (!selected) throw new Error("SPA_DEMO_REFUND_ISOLATION_FAILED");

    const group = await spaPrisma.spaBooking.findMany({
      where: {
        storeId: SPA_DEMO_STORE.id,
        partyGroupId: selected.partyGroupId ?? selected.id,
        status: "COMPLETED",
      },
      orderBy: { guestIndex: "asc" },
    });
    const targets = parsed.data.scope === "GROUP" ? group : group.filter((booking) => booking.id === selected.id);
    if (!targets.length) throw new Error("SPA_DEMO_REFUND_GROUP_INVALID");

    const customer = await prisma.customer.findFirst({
      where: { id: selected.customerId, storeId: SPA_DEMO_STORE.id },
      select: { name: true },
    });
    if (!customer) throw new Error("SPA_DEMO_REFUND_ISOLATION_FAILED");

    const result = await spaPrisma.$transaction(async (tx) => {
      for (const booking of targets) {
        await tx.$queryRaw`SELECT id FROM "SpaBooking" WHERE id = ${booking.id} FOR UPDATE`;
      }
      const originals = await tx.spaPayment.findMany({
        where: {
          storeId: SPA_DEMO_STORE.id,
          bookingId: { in: targets.map((booking) => booking.id) },
          refundOfPaymentId: null,
          status: { in: ["SUCCESS", "REFUNDED"] },
        },
      });
      if (originals.length !== targets.length) throw new Error("SPA_DEMO_REFUND_PAYMENT_INVALID");
      if (originals.some((payment) => payment.status === "REFUNDED")) throw new Error("SPA_DEMO_ALREADY_REFUNDED");

      let storedValueBalance: number | null = null;
      let packageRemainingSessions: number | null = null;
      const refundedAt = new Date();
      const refunds: { bookingId: string; amount: number }[] = [];

      for (const booking of targets) {
        const original = originals.find((payment) => payment.bookingId === booking.id)!;
        const amount = Number(original.netAmount);
        const refundId = `spa-refund-${booking.id}`;
        if (await tx.spaPayment.findUnique({ where: { id: refundId } })) throw new Error("SPA_DEMO_ALREADY_REFUNDED");

        await tx.spaPayment.create({
          data: {
            id: refundId,
            storeId: SPA_DEMO_STORE.id,
            customerId: booking.customerId,
            bookingId: booking.id,
            revenueStaffId: original.revenueStaffId,
            soldByStaffId: original.soldByStaffId,
            grossAmount: amount,
            netAmount: amount,
            paymentMethod: original.paymentMethod,
            status: "SUCCESS",
            quantity: 1,
            refundOfPaymentId: original.id,
            paidAt: refundedAt,
            refundedAt,
            refundReason: parsed.data.reason,
            note: `SPA Demo 退款｜${parsed.data.reason}`,
          },
        });
        await tx.spaPayment.update({
          where: { id: original.id },
          data: { status: "REFUNDED", refundedAt, refundReason: parsed.data.reason },
        });

        if (original.paymentMethod === "STORED_VALUE") {
          const wallet = await tx.spaStoredValueWallet.findUnique({ where: { id: SPA_DEMO_LIVE_FLOW_STORED_WALLET_ID } });
          if (!wallet || wallet.storeId !== SPA_DEMO_STORE.id) throw new Error("SPA_DEMO_REFUND_STORED_INVALID");
          await tx.$queryRaw`SELECT id FROM "SpaStoredValueWallet" WHERE id = ${wallet.id} FOR UPDATE`;
          const locked = await tx.spaStoredValueWallet.findUnique({ where: { id: wallet.id } });
          storedValueBalance = Number(locked?.balance ?? 0) + amount;
          await tx.spaStoredValueWallet.update({ where: { id: wallet.id }, data: { balance: storedValueBalance } });
          await tx.spaStoredValueEntry.create({
            data: {
              id: `spa-refund-ledger-${booking.id}`,
              walletId: wallet.id,
              storeId: SPA_DEMO_STORE.id,
              customerId: booking.customerId,
              bookingId: booking.id,
              paymentId: refundId,
              entryType: "REFUND",
              amount,
              balanceAfter: storedValueBalance,
              note: `SPA Demo 退款｜${parsed.data.reason}`,
            },
          });
        }

        if (original.paymentMethod === "ENTITLEMENT") {
          const restored = await tx.spaEntitlementUse.updateMany({
            where: {
              storeId: SPA_DEMO_STORE.id,
              bookingId: booking.id,
              entitlementId: SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID,
              status: "COMPLETED",
            },
            data: { status: "RELEASED", releasedAt: refundedAt },
          });
          if (restored.count !== 1) throw new Error("SPA_DEMO_REFUND_PACKAGE_INVALID");
          const entitlement = await tx.spaEntitlement.update({
            where: { id: SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID },
            data: { remainingUses: { increment: 1 }, status: "ACTIVE" },
          });
          packageRemainingSessions = entitlement.remainingUses;
        }

        await tx.spaBooking.update({
          where: { id: booking.id },
          data: {
            notes: `${booking.notes ?? "SPA_DEMO_LIVE_FLOW"}|refund=REFUNDED|refundAmount=${amount}|refundReason=${parsed.data.reason}|refundedAt=${refundedAt.toISOString()}`,
          },
        });
        refunds.push({ bookingId: booking.id, amount });
      }

      return {
        date: selected.bookingDate.toISOString().slice(0, 10),
        bookingIds: targets.map((booking) => booking.id),
        refunds,
        refundAmount: refunds.reduce((sum, refund) => sum + refund.amount, 0),
        reason: parsed.data.reason,
        refundedAt: refundedAt.toISOString(),
        customer: customer.name,
        time: selected.startTime,
        scope: parsed.data.scope,
        settlements: [...new Set(originals.map((payment) => payment.paymentMethod))],
        refundedBy: "店長",
        storedValueBalance,
        packageRemainingSessions,
      };
    });

    await prisma.reconciliationRun.create({
      data: {
        storeId: SPA_DEMO_STORE.id,
        triggeredBy: "spa_demo_manager_refund",
        status: "pass",
        targetDate: result.date,
        targetMonth: result.date.slice(0, 7),
        totalChecks: 1,
        passCount: 1,
        mismatchCount: 0,
        errorCount: 0,
        durationMs: 0,
        finishedAt: new Date(result.refundedAt),
        checks: {
          create: [{
            checkCode: "spa_daily_checkout_refund",
            checkName: "SPA 獨立退款",
            status: "pass",
            sources: { bookingIds: result.bookingIds, amounts: result.refunds.map((refund) => refund.amount) },
            expected: result.reason,
            debugPayload: { customer: result.customer, slotTime: result.time, scope: result.scope, settlements: result.settlements, refundedBy: "spa_demo_manager", source: "SpaPayment" },
          }],
        },
      },
    });

    revalidateSpaDemo();
    return { success: true as const, data: result };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (message === "SPA_DEMO_ALREADY_REFUNDED") return { success: false as const, error: "這筆結帳已退款，請勿重複操作" };
    if (message === "SPA_DEMO_REFUND_PACKAGE_INVALID") return { success: false as const, error: "療程扣次資料不一致，整筆未變更" };
    if (message === "SPA_DEMO_REFUND_STORED_INVALID") return { success: false as const, error: "儲值金資料不一致，整筆未變更" };
    return { success: false as const, error: "目前無法退款，請重新整理後再試" };
  }
}
