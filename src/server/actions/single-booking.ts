"use server";

import type { z } from "zod";
import { prisma } from "@/lib/db";
import { requireWritablePermission } from "@/lib/permissions";
import { assertStoreSubscriptionWritable } from "@/lib/subscription-guard";
import { AppError, handleActionError } from "@/lib/errors";
import { currentStoreId } from "@/lib/store";
import { collectSinglePaymentSchema } from "@/lib/validators/single-booking";
import { buildTransactionSnapshot } from "@/lib/transaction-snapshot";
import { revalidateBookings, revalidateTransactions } from "@/lib/revalidation";
import { completePaidBookingInTransaction } from "@/server/services/paid-booking-completion";
import { createBookingCompletedEvent } from "@/server/services/referral-events";
import {
  normalizePaymentSplits,
  paymentSplitCreateData,
} from "@/lib/payment-splits";
import type { ActionResult } from "@/types";
import type { PaymentMethod, TransactionType } from "@prisma/client";
import { requireSteamfootStore } from "@/lib/industry-module-server";

// ============================================================
// collectSinglePayment — 單次（SINGLE，不扣堂）現場收款
//
// 設計鏡像 collectTrialPayment：
//   - 共用 SUCCESS-only baseline（不寫 PENDING）
//   - 共用 store-scoped 查詢 + requireWritablePermission 雙重防線
//   - 共用 buildTransactionSnapshot（含快照 + 首購判定 + 折扣 = gross - net）
//
// 與 trial 的差異：
//   - bookingType 必須是 SINGLE（不接受 FIRST_TRIAL / PACKAGE_SESSION）
//   - 透過 booking.update 權限把關（規格）：能完成預約 → 才能完成收款；
//     避免「可完成但不能收款」造成漏帳
//   - 原價優先使用療程／單次快照，再 fallback servicePlan.price ?? 799
//   - 不寫 CustomerPlanWallet / WalletSession / 不扣堂（wallet-free）
//
// 重複收款：同 booking 已有 SINGLE_PURCHASE + SUCCESS → 拒絕
// ============================================================

const SINGLE_DEFAULT_PRICE = 799;

export async function collectSinglePayment(
  input: z.infer<typeof collectSinglePaymentSchema>,
): Promise<ActionResult<{ transactionId: string; serviceCompleted: boolean }>> {
  try {
    const user = await requireWritablePermission("booking.update");
    const data = collectSinglePaymentSchema.parse(input);
    const completeService = data.completeService === true;
    const storeId = currentStoreId(user);
    await requireSteamfootStore(storeId);
    // 訂閱到期保護：到期店家不可收款（無訂閱店不擋）
    await assertStoreSubscriptionWritable(storeId);

    // store-scoped 查詢即安全邊界（ID 格式非關卡）
    const booking = await prisma.booking.findFirst({
      where: { id: data.bookingId, storeId },
      select: {
        id: true,
        bookingType: true,
        bookingStatus: true,
        customerId: true,
        revenueStaffId: true,
        serviceStaffId: true,
        servicePlanId: true,
        expectedAmount: true,
        treatmentPriceSnapshot: true,
        bookingDate: true,
        slotTime: true,
        servicePlan: { select: { price: true } },
        customer: { select: { assignedStaffId: true, sponsorId: true } },
      },
    });
    if (!booking) throw new AppError("NOT_FOUND", "預約不存在或不屬於本店");

    if (booking.bookingType !== "SINGLE") {
      throw new AppError("BUSINESS_RULE", "僅單次（不扣堂）預約可走此收款");
    }
    if (
      booking.bookingStatus !== "PENDING" &&
      booking.bookingStatus !== "CONFIRMED"
    ) {
      throw new AppError(
        "BUSINESS_RULE",
        "此預約狀態無法收款（僅未完成 / 未取消的預約可收款）",
      );
    }

    // SPA 預約以建立當下的服務組合總價快照為準；非 SPA 舊資料再沿用
    // servicePlan.price，最後才使用歷史 fallback。
    // 實收：未傳 amount → 預設等於原價（= 全價）。
    const originalAmount =
      booking.treatmentPriceSnapshot != null
        ? Number(booking.treatmentPriceSnapshot)
        : booking.expectedAmount != null
          ? Number(booking.expectedAmount)
          : booking.servicePlan?.price != null
            ? Number(booking.servicePlan.price)
            : SINGLE_DEFAULT_PRICE;
    const netAmount = data.amount ?? originalAmount;
    const paymentSplits = normalizePaymentSplits(data.paymentSplits, netAmount);

    if (netAmount > originalAmount) {
      throw new AppError("VALIDATION", "實收金額不可高於原價");
    }

    // 營收歸屬（規格 #5）：booking.revenueStaffId 優先，再 fallback customer 直屬店長，
    // 最後才用操作者本人。任何一條命中就停（不再 throw FORBIDDEN — SINGLE 不像
    // 體驗客有「必須有直屬店長」的硬規則，店家可能臨櫃單收）。
    const revenueStaffId =
      booking.revenueStaffId ??
      booking.serviceStaffId ??
      booking.customer.assignedStaffId ??
      user.staffId ??
      (() => {
        throw new AppError(
          "FORBIDDEN",
          "無法判定營收歸屬（顧客未指派直屬店長、操作者亦無 staff 身分）",
        );
      })();

    const result = await prisma.$transaction(async (txClient) => {
      // P1 race-safe duplicate guard：用 Booking row lock 串行化同一 booking
      // 的並發收款。原本 findFirst 在 transaction 外屬於 TOCTOU 漏洞 — 兩次
      // 快速點擊或重送可能各自通過 guard 後各自 create → 同筆 booking 雙
      // 收款、營收雙算。
      //
      // 鎖定後（任何同 bookingId 的並發 tx 會 block 在這行）才再次查
      // SINGLE_PURCHASE SUCCESS：能看到任何 winner 已 commit 的交易並拒絕。
      // 不同 bookingId 不互相影響（row-level lock）。
      await txClient.$queryRaw`SELECT id FROM "Booking" WHERE id = ${booking.id} FOR UPDATE`;

      const existing = await txClient.transaction.findFirst({
        where: {
          bookingId: booking.id,
          transactionType: "SINGLE_PURCHASE",
          status: "SUCCESS",
        },
        select: { id: true },
      });
      if (existing) {
        throw new AppError("BUSINESS_RULE", "此預約已收款，請勿重複收款");
      }

      const snapshot = await buildTransactionSnapshot(txClient, {
        customerId: booking.customerId,
        storeId,
        revenueStaffId,
        planId: booking.servicePlanId ?? null,
        grossAmount: originalAmount,
        netAmount,
      });

      // wallet-free：不帶 customerPlanWalletId，不建 WalletSession，不扣堂。
      const transaction = await txClient.transaction.create({
        data: {
          customerId: booking.customerId,
          bookingId: booking.id,
          revenueStaffId,
          serviceStaffId: booking.serviceStaffId ?? user.staffId ?? null,
          soldByStaffId: user.staffId ?? null,
          transactionType: "SINGLE_PURCHASE" as TransactionType,
          paymentMethod: data.paymentMethod as PaymentMethod,
          ...paymentSplitCreateData(paymentSplits),
          paymentStatus: "SUCCESS",
          paidAt: new Date(),
          amount: netAmount,
          storeId,
          discountReason: data.discountReason ?? null,
          note: data.note ?? null,
          ...snapshot,
        },
      });

      if (completeService) {
        await completePaidBookingInTransaction(txClient, {
          bookingId: booking.id,
          bookingType: booking.bookingType,
          customerId: booking.customerId,
          storeId,
          bookingDate: booking.bookingDate,
          slotTime: booking.slotTime,
          serviceStaffId: booking.serviceStaffId ?? user.staffId ?? null,
        });
      }

      return transaction;
    });

    if (completeService) {
      try {
        await createBookingCompletedEvent({
          storeId,
          customerId: booking.customerId,
          referrerId: booking.customer.sponsorId ?? null,
          bookingId: booking.id,
          source: "collect-and-complete",
        });
      } catch {
        // 埋點失敗不影響已原子完成的收款與服務。
      }
    }

    revalidateBookings(booking.customerId);
    revalidateTransactions(booking.customerId);
    return {
      success: true,
      data: { transactionId: result.id, serviceCompleted: completeService },
    };
  } catch (e) {
    return handleActionError(e);
  }
}
