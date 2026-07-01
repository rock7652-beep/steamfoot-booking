"use server";

import type { z } from "zod";
import { prisma } from "@/lib/db";
import { requireWritablePermission } from "@/lib/permissions";
import { assertStoreSubscriptionWritable } from "@/lib/subscription-guard";
import { AppError, handleActionError } from "@/lib/errors";
import { currentStoreId } from "@/lib/store";
import {
  adjustCheckoutToPackageSchema,
  adjustCheckoutToSingleSchema,
} from "@/lib/validators/booking-checkout";
import {
  allocateSessionsFefo,
  releaseSessions,
} from "@/server/services/wallet-session";
import { revalidateBookings } from "@/lib/revalidation";
import type { ActionResult } from "@/types";

// ============================================================
// adjustCheckoutToPackage — 調整結帳方式（Phase 1）
//
// 單一情境：SINGLE（單次，未收款）→ PACKAGE_SESSION（方案扣堂）。
// 現場顧客原本是單次/現場收款，到店臨時購買方案或儲值，店長把這「同一筆既有
// 預約」改成扣方案，不重約、不佔其他時段、不受原預約時間已過限制。
//
// 設計原則（與 PR #166 collectSinglePayment 一致）：
//   - store-scoped 查詢 + requireWritablePermission("booking.update") 雙重防線
//   - $transaction 內 Booking row FOR UPDATE → 重查 guard（race-safe）：
//     與並發 collectSinglePayment / markCompleted 串行化，避免「轉成方案的
//     同時被收了單次款」或「轉換與完成扣堂交錯」。
//   - 配堂只「呼叫」既有 allocateSessionsFefo（與 createBooking 同一路徑），
//     不修改 wallet-session 核心邏輯。
//
// 零金流副作用：
//   - 不建 / 不改任何 Transaction（扣堂在「完成服務」才發生、收款不適用）
//   - 不寫 Cashbook / CashDrawer
//   - 不做 schema migration
//   - 用通用 AuditLog 記 before/after，誤操作可追溯
// ============================================================

export async function adjustCheckoutToPackage(
  input: z.infer<typeof adjustCheckoutToPackageSchema>,
): Promise<ActionResult<{ walletId: string }>> {
  try {
    const user = await requireWritablePermission("booking.update");
    const data = adjustCheckoutToPackageSchema.parse(input);
    const storeId = currentStoreId(user);
    // 訂閱到期保護：到期店家不可結帳轉換（無訂閱店不擋）
    await assertStoreSubscriptionWritable(storeId);

    // store-scoped 查詢即安全邊界（ID 格式非關卡）
    const booking = await prisma.booking.findFirst({
      where: { id: data.bookingId, storeId },
      select: {
        id: true,
        bookingType: true,
        bookingStatus: true,
        customerId: true,
        people: true,
        isMakeup: true,
        servicePlanId: true,
        customerPlanWalletId: true,
      },
    });
    if (!booking) throw new AppError("NOT_FOUND", "預約不存在或不屬於本店");

    if (booking.isMakeup) {
      throw new AppError("BUSINESS_RULE", "補課預約不適用調整結帳方式");
    }
    if (booking.bookingType !== "SINGLE") {
      throw new AppError(
        "BUSINESS_RULE",
        "目前僅支援「單次未收款 → 方案扣堂」，此預約非單次",
      );
    }
    if (
      booking.bookingStatus !== "PENDING" &&
      booking.bookingStatus !== "CONFIRMED"
    ) {
      throw new AppError(
        "BUSINESS_RULE",
        "此預約狀態無法調整結帳方式（僅未完成 / 未取消的預約可調整）",
      );
    }

    // 已收款（已有 SINGLE_PURCHASE SUCCESS）→ 不可直接切換，須走收款更正流程
    const paidSingle = await prisma.transaction.findFirst({
      where: {
        bookingId: booking.id,
        transactionType: "SINGLE_PURCHASE",
        status: "SUCCESS",
      },
      select: { id: true },
    });
    if (paidSingle) {
      throw new AppError(
        "BUSINESS_RULE",
        "此預約已有成功收款紀錄，需先走收款更正流程後再調整結帳方式",
      );
    }

    // 顧客當下可用方案（ACTIVE）— allocateSessionsFefo 跨 wallet 候選
    const wallets = await prisma.customerPlanWallet.findMany({
      where: {
        customerId: booking.customerId,
        storeId,
        status: "ACTIVE",
      },
      select: {
        id: true,
        planId: true,
        expiryDate: true,
        createdAt: true,
        remainingSessions: true,
      },
    });

    const chosen = wallets.find((w) => w.id === data.walletId);
    if (!chosen) {
      throw new AppError(
        "NOT_FOUND",
        "找不到指定方案，或方案非此顧客 / 非有效狀態",
      );
    }
    if (chosen.remainingSessions <= 0) {
      throw new AppError("BUSINESS_RULE", "所選方案已無剩餘堂數");
    }

    // 跨 wallet 總剩餘需 >= 預約人數（people），不足提早給乾淨錯誤；
    // 真正配堂與最終 primary wallet 由 allocateSessionsFefo 決定。
    const totalRemaining = wallets.reduce(
      (sum, w) => sum + w.remainingSessions,
      0,
    );
    if (totalRemaining < booking.people) {
      throw new AppError(
        "BUSINESS_RULE",
        `方案總剩餘 ${totalRemaining} 堂，不足本次 ${booking.people} 人預約所需堂數`,
      );
    }

    const planIdByWallet = new Map(wallets.map((w) => [w.id, w.planId]));

    const finalWalletId = await prisma.$transaction(async (tx) => {
      // race-safe：鎖 Booking row，串行化同 booking 的並發收款 / 完成 / 轉換
      await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${booking.id} FOR UPDATE`;

      // 鎖定後重查狀態（防 TOCTOU：collectSinglePayment / markCompleted 可能
      // 在外層查詢後 commit）
      const fresh = await tx.booking.findUnique({
        where: { id: booking.id },
        select: { bookingType: true, bookingStatus: true, people: true },
      });
      if (!fresh) throw new AppError("NOT_FOUND", "預約不存在");
      if (fresh.bookingType !== "SINGLE") {
        throw new AppError("CONFLICT", "預約結帳方式已變更，請重新整理");
      }
      if (
        fresh.bookingStatus !== "PENDING" &&
        fresh.bookingStatus !== "CONFIRMED"
      ) {
        throw new AppError("CONFLICT", "預約狀態已變更，請重新整理");
      }
      const paidNow = await tx.transaction.findFirst({
        where: {
          bookingId: booking.id,
          transactionType: "SINGLE_PURCHASE",
          status: "SUCCESS",
        },
        select: { id: true },
      });
      if (paidNow) {
        throw new AppError(
          "CONFLICT",
          "此預約已收款，請改走收款更正流程",
        );
      }

      // 1. 轉成方案扣堂 + 綁定所選 wallet
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          bookingType: "PACKAGE_SESSION",
          customerPlanWalletId: chosen.id,
          servicePlanId: chosen.planId,
        },
      });

      // 2. 配堂（RESERVED）— 與 createBooking 同一路徑，preferred = 所選 wallet。
      //    people 數可能橫跨多張 wallet（FEFO），primary 可能與 preferred 不同。
      const { primaryWalletId } = await allocateSessionsFefo(tx, {
        candidates: wallets.map((w) => ({
          id: w.id,
          expiryDate: w.expiryDate,
          createdAt: w.createdAt,
          remainingSessions: w.remainingSessions,
        })),
        bookingId: booking.id,
        count: fresh.people,
        preferredWalletId: chosen.id,
      });

      // 3. 若實際 primary 與 preferred 不同（preferred 被略過）→ 同步 booking 欄位
      const effectiveWalletId = primaryWalletId ?? chosen.id;
      if (effectiveWalletId !== chosen.id) {
        await tx.booking.update({
          where: { id: booking.id },
          data: {
            customerPlanWalletId: effectiveWalletId,
            servicePlanId: planIdByWallet.get(effectiveWalletId) ?? chosen.planId,
          },
        });
      }

      // 4. 稽核（before/after）— 誤操作可追溯、可反向手動回復
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          targetType: "Booking",
          targetId: booking.id,
          action: "ADJUST_CHECKOUT_METHOD",
          beforeJson: {
            bookingType: "SINGLE",
            customerPlanWalletId: booking.customerPlanWalletId,
            servicePlanId: booking.servicePlanId,
          },
          afterJson: {
            bookingType: "PACKAGE_SESSION",
            customerPlanWalletId: effectiveWalletId,
            servicePlanId: planIdByWallet.get(effectiveWalletId) ?? chosen.planId,
          },
        },
      });

      return effectiveWalletId;
    });

    revalidateBookings(booking.customerId);
    return { success: true, data: { walletId: finalWalletId } };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// adjustCheckoutToSingle — 調整結帳方式（Phase 2 / Mode B）
//
// 單一情境：PACKAGE_SESSION（方案扣堂，未完成、未扣堂）→ SINGLE（單次，未收款）。
// 店長原本用方案幫顧客預約，到現場臨時做促銷／優惠，這次不想扣方案堂數，改成
// 單次收款。本 action 只負責「把這筆既有預約翻成乾淨的單次未收款」，不重約、
// 不收款、不寫金額——促銷價留到後續既有收款 Modal 由店長用原價/實收/折扣處理。
//
// 設計原則（與 Mode A / collectSinglePayment 一致）：
//   - store-scoped 查詢 + requireWritablePermission("booking.update") 雙重防線
//   - $transaction 內 Booking row FOR UPDATE → 重查 guard（race-safe）：與並發
//     markCompleted / collectSinglePayment 串行化，避免「轉成單次的同時被扣堂／
//     收款」交錯。
//   - 釋放配堂只「呼叫」既有 releaseSessions（與 cancelBooking 同一安全路徑），
//     RESERVED → AVAILABLE、堂數回補，不硬刪、不改 wallet-session 核心。
//
// 零金流副作用：
//   - 不建 / 不改任何 Transaction（轉換不收款；收款於之後既有單次流程才發生）
//   - 不寫 Cashbook / CashDrawer
//   - 不做 schema migration
//   - 用通用 AuditLog 記 before/after（reason 選填，空白也寫）
// ============================================================

export async function adjustCheckoutToSingle(
  input: z.infer<typeof adjustCheckoutToSingleSchema>,
): Promise<ActionResult<{ bookingId: string }>> {
  try {
    const user = await requireWritablePermission("booking.update");
    const data = adjustCheckoutToSingleSchema.parse(input);
    const storeId = currentStoreId(user);

    // store-scoped 查詢即安全邊界（ID 格式非關卡）
    const booking = await prisma.booking.findFirst({
      where: { id: data.bookingId, storeId },
      select: {
        id: true,
        bookingType: true,
        bookingStatus: true,
        customerId: true,
        isMakeup: true,
        servicePlanId: true,
        customerPlanWalletId: true,
        expectedAmount: true,
      },
    });
    if (!booking) throw new AppError("NOT_FOUND", "預約不存在或不屬於本店");

    if (booking.isMakeup) {
      throw new AppError("BUSINESS_RULE", "補課預約不適用調整結帳方式");
    }
    if (booking.bookingType !== "PACKAGE_SESSION") {
      throw new AppError(
        "BUSINESS_RULE",
        "目前僅支援「方案扣堂 → 單次未收款」，此預約非方案扣堂",
      );
    }
    if (
      booking.bookingStatus !== "PENDING" &&
      booking.bookingStatus !== "CONFIRMED"
    ) {
      throw new AppError(
        "BUSINESS_RULE",
        "此預約狀態無法調整結帳方式（僅未完成 / 未取消的預約可調整）",
      );
    }

    // 已扣堂（有 COMPLETED WalletSession）→ 不可改為單次，否則堂數沒補回。
    const deductedCount = await prisma.walletSession.count({
      where: { bookingId: booking.id, status: "COMPLETED" },
    });
    if (deductedCount > 0) {
      throw new AppError(
        "BUSINESS_RULE",
        "此預約已扣堂，無法改為單次（請改走更正流程）",
      );
    }

    // 已有任何 SUCCESS 交易（扣堂 / 收款）→ 不可改，避免重複營收 / 帳務不一致。
    const successTx = await prisma.transaction.findFirst({
      where: { bookingId: booking.id, status: "SUCCESS" },
      select: { id: true },
    });
    if (successTx) {
      throw new AppError(
        "BUSINESS_RULE",
        "此預約已有成功交易紀錄，需先走更正流程後再調整結帳方式",
      );
    }

    await prisma.$transaction(async (tx) => {
      // race-safe：鎖 Booking row，串行化同 booking 的並發完成扣堂 / 收款 / 轉換
      await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${booking.id} FOR UPDATE`;

      // 鎖定後重查狀態（防 TOCTOU：markCompleted / collectSinglePayment 可能
      // 在外層查詢後 commit）
      const fresh = await tx.booking.findUnique({
        where: { id: booking.id },
        select: { bookingType: true, bookingStatus: true, isMakeup: true },
      });
      if (!fresh) throw new AppError("NOT_FOUND", "預約不存在");
      if (fresh.bookingType !== "PACKAGE_SESSION") {
        throw new AppError("CONFLICT", "預約結帳方式已變更，請重新整理");
      }
      if (
        fresh.bookingStatus !== "PENDING" &&
        fresh.bookingStatus !== "CONFIRMED"
      ) {
        throw new AppError("CONFLICT", "預約狀態已變更，請重新整理");
      }
      // 鎖定後重查「已扣堂 / 已有 SUCCESS 交易」（防 markCompleted 並發 commit）
      const deductedNow = await tx.walletSession.count({
        where: { bookingId: booking.id, status: "COMPLETED" },
      });
      if (deductedNow > 0) {
        throw new AppError("CONFLICT", "此預約已扣堂，請改走更正流程");
      }
      const txNow = await tx.transaction.findFirst({
        where: { bookingId: booking.id, status: "SUCCESS" },
        select: { id: true },
      });
      if (txNow) {
        throw new AppError("CONFLICT", "此預約已有成功交易，請改走更正流程");
      }

      // 1. 安全釋放配堂（RESERVED → AVAILABLE），堂數回補。與 cancelBooking 同一
      //    路徑，不硬刪、不改 wallet-session 核心。
      await releaseSessions(tx, booking.id);

      // 2. 翻成乾淨的單次未收款：清掉方案 / wallet / 金額快照。單次原價於收款時
      //    由既有 collectSinglePayment 依 servicePlan.price ?? 799（此處 null → 799）取得。
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          bookingType: "SINGLE",
          customerPlanWalletId: null,
          servicePlanId: null,
          expectedAmount: null,
        },
      });

      // 3. 稽核（before/after）— reason 選填，空白也寫入。誤操作可追溯、可反向手動回復。
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          targetType: "Booking",
          targetId: booking.id,
          action: "ADJUST_CHECKOUT_METHOD",
          beforeJson: {
            bookingType: "PACKAGE_SESSION",
            customerPlanWalletId: booking.customerPlanWalletId,
            servicePlanId: booking.servicePlanId,
            expectedAmount:
              booking.expectedAmount == null
                ? null
                : Number(booking.expectedAmount),
          },
          afterJson: {
            bookingType: "SINGLE",
            customerPlanWalletId: null,
            servicePlanId: null,
            expectedAmount: null,
            reason: data.reason ?? null,
          },
        },
      });
    });

    revalidateBookings(booking.customerId);
    return { success: true, data: { bookingId: booking.id } };
  } catch (e) {
    return handleActionError(e);
  }
}
