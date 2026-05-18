"use server";

import type { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { AppError, handleActionError } from "@/lib/errors";
import { currentStoreId } from "@/lib/store";
import { getTrialSettings, clampTrialPrice } from "@/lib/shop-config";
import { ensureTrialPlan } from "@/server/services/trial-plan";
import { createCustomer } from "@/server/actions/customer";
import { createBooking } from "@/server/actions/booking";
import { listStaffSelectOptions } from "@/server/queries/staff";
import {
  createTrialBookingSchema,
  collectTrialPaymentSchema,
} from "@/lib/validators/trial-booking";
import { buildTransactionSnapshot } from "@/lib/transaction-snapshot";
import { revalidateBookings, revalidateTransactions } from "@/lib/revalidation";
import type { TrialSettings } from "@/lib/shop-config";
import type { ActionResult } from "@/types";
import type { PaymentMethod, TransactionType } from "@prisma/client";

// ============================================================
// loadTrialBookingFormData — read-only：給「建立體驗預約」Drawer 用
// 回傳體驗課設定 + 在職店長清單。純讀，不寫任何資料。
// ============================================================

export async function loadTrialBookingFormData(): Promise<
  ActionResult<{
    settings: TrialSettings;
    staffOptions: { id: string; displayName: string }[];
  }>
> {
  try {
    const user = await requirePermission("trial.create");
    const storeId = currentStoreId(user);
    const [settings, staffOptions] = await Promise.all([
      getTrialSettings(storeId),
      listStaffSelectOptions(storeId),
    ]);
    return { success: true, data: { settings, staffOptions } };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// createTrialBooking — 體驗 499 PR-2
//
// 建立「未付款」FIRST_TRIAL 預約。嚴格不做：
//   - 不建立 Transaction（任何型別 / 任何 paymentStatus）
//   - 不建立 CustomerPlanWallet / WalletSession
//   - 不產生營收（沒有 Transaction 就不會被任何營收 query 撈到）
//
// 複用既有邏輯，不重造：
//   - 顧客 find-or-create + 同店電話去重（createCustomer，重複 phone 回 existingCustomerId）
//   - 體驗課單一 Plan（ensureTrialPlan，idempotent、不改既有價）
//   - 體驗價來源 + clamp（getTrialSettings / clampTrialPrice）
//   - 名額/營業日/值班檢查 + 建立 Booking（createBooking，FIRST_TRIAL + 無 wallet）
//
// 直屬店長：體驗客必填。決策2：既有顧客若「尚未」有直屬店長 → 補上；
//   若「已有」→ 不覆蓋（避免誤改正式顧客歸屬）。
// ============================================================

export async function createTrialBooking(
  input: z.infer<typeof createTrialBookingSchema>
): Promise<ActionResult<{ bookingId: string; customerId: string }>> {
  try {
    const user = await requirePermission("trial.create");
    const data = createTrialBookingSchema.parse(input);
    const storeId = currentStoreId(user);

    const settings = await getTrialSettings(storeId);
    if (!settings.trialEnabled) {
      throw new AppError("BUSINESS_RULE", "體驗單功能已停用，請洽店長於設定開啟");
    }

    // 直屬店長驗證（同店、ACTIVE）
    const staff = await prisma.staff.findFirst({
      where: { id: data.assignedStaffId, status: "ACTIVE", storeId },
      select: { id: true },
    });
    if (!staff) throw new AppError("NOT_FOUND", "指定直屬店長不存在或未啟用");

    // ── 1. 解析顧客：既有 or 快速建檔（去重，不建第二筆）
    let customerId: string;
    if (data.customerId) {
      const existing = await prisma.customer.findFirst({
        where: { id: data.customerId, storeId },
        select: { id: true, assignedStaffId: true },
      });
      if (!existing) throw new AppError("NOT_FOUND", "顧客不存在或不屬於本店");
      customerId = existing.id;
    } else {
      const created = await createCustomer({
        name: data.newCustomer!.name,
        phone: data.newCustomer!.phone,
        assignedStaffId: data.assignedStaffId,
      });
      if (created.success) {
        customerId = created.data.customerId;
      } else if (created.existingCustomerId) {
        // 同店電話已存在 → 沿用既有顧客，不建立第二筆（避免身分分裂）
        customerId = created.existingCustomerId;
      } else {
        return { success: false, error: created.error };
      }
    }

    // ── 2. 直屬店長：僅在「尚未指派」時補上，不覆蓋既有歸屬
    const cust = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { assignedStaffId: true },
    });
    if (cust && !cust.assignedStaffId) {
      await prisma.customer.update({
        where: { id: customerId },
        data: { assignedStaffId: data.assignedStaffId },
      });
    }

    // ── 3. 體驗課單一 Plan（idempotent，不改既有價）
    const trialPlan = await ensureTrialPlan(storeId, settings.trialDefaultPrice);

    // ── 4. 金額快照：未傳則帶店家預設；一律 clamp（含 allowEdit=false 強制預設）
    const expectedAmount = clampTrialPrice(
      data.expectedAmount ?? settings.trialDefaultPrice,
      settings,
    );

    // ── 5. 建立 FIRST_TRIAL 預約（複用 createBooking：名額/營業日/值班檢查）
    //      無 customerPlanWalletId → 既有邏輯保證不 allocateSession、不扣堂。
    //      不呼叫 assignPlanToCustomer → 不建 Transaction / Wallet / 營收。
    const result = await createBooking({
      customerId,
      bookingDate: data.bookingDate,
      slotTime: data.slotTime,
      bookingType: "FIRST_TRIAL",
      servicePlanId: trialPlan.id,
      expectedAmount,
      notes: data.notes,
    });

    if (!result.success) return { success: false, error: result.error };
    return {
      success: true,
      data: { bookingId: result.data.bookingId, customerId },
    };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// collectTrialPayment — 體驗 499 PR-3：現場立即收款
//
// SUCCESS-only baseline。店長只有在顧客「已付款」後才按收款，此 action
// 當下即建立一筆真實營收交易：
//   - transactionType = TRIAL_PURCHASE
//   - status = SUCCESS（由 buildTransactionSnapshot 寫入）
//   - paymentStatus = SUCCESS（明確寫入，不用 default 隱含）
//   - paidAt = now、bookingId 連到該 FIRST_TRIAL 預約、paymentMethod 必填
//
// 嚴格不做：
//   - 不建 PENDING / UNPAID / 待確認 / 預收交易
//   - 不碰 CustomerPlanWallet / WalletSession / 正式方案堂數
//     （不呼叫 assignPlanToCustomer；它一律建 wallet+session）
//   - 不自動寫 CashbookEntry / CashDrawerEntry（現金統計沿用 paymentMethod=CASH）
//   - 不做退款 / void（已付款後取消走既有 voidTransaction 流程）
//
// 因此未收款前完全沒有 Transaction（PR-2 保證），已收款才有一筆 SUCCESS，
// 既有 revenue/report 查詢（過濾 status=SUCCESS）本來就正確 → 那批
// paymentStatus query 不需在 PR-3 修改。
//
// 防呆：
//   - 僅 FIRST_TRIAL 且 bookingStatus ∈ {PENDING, CONFIRMED}
//   - 已有 TRIAL_PURCHASE + SUCCESS 交易 → 拒絕重複收款
//   - store-scoped 查詢 + requirePermission("trial.confirm") 為安全邊界
//
// 歸屬沿用既有規則（不重造）：
//   revenueStaffId = customer.assignedStaffId ?? operator.staffId（建時快照）
//   soldByStaffId / serviceStaffId = operator.staffId
// ============================================================

export async function collectTrialPayment(
  input: z.infer<typeof collectTrialPaymentSchema>,
): Promise<ActionResult<{ transactionId: string }>> {
  try {
    const user = await requirePermission("trial.confirm");
    const data = collectTrialPaymentSchema.parse(input);
    const storeId = currentStoreId(user);

    const settings = await getTrialSettings(storeId);

    // store-scoped 查詢即安全邊界（ID 格式非關卡）
    const booking = await prisma.booking.findFirst({
      where: { id: data.bookingId, storeId },
      select: {
        id: true,
        bookingType: true,
        bookingStatus: true,
        customerId: true,
        servicePlanId: true,
        expectedAmount: true,
        customer: { select: { assignedStaffId: true } },
      },
    });
    if (!booking) throw new AppError("NOT_FOUND", "預約不存在或不屬於本店");
    if (booking.bookingType !== "FIRST_TRIAL") {
      throw new AppError("BUSINESS_RULE", "僅體驗預約可現場收款");
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

    // 防止重複收款：已有 TRIAL_PURCHASE + SUCCESS 即拒絕
    const existing = await prisma.transaction.findFirst({
      where: {
        bookingId: booking.id,
        transactionType: "TRIAL_PURCHASE",
        status: "SUCCESS",
      },
      select: { id: true },
    });
    if (existing) {
      throw new AppError("BUSINESS_RULE", "此預約已收款，請勿重複收款");
    }

    // 金額：未傳 → Booking.expectedAmount 快照 → 店家預設；一律 clamp
    //（clampTrialPrice 在 allowEdit=false 時強制回店家預設，忽略傳入值）
    const baseAmount =
      data.amount ??
      (booking.expectedAmount == null
        ? settings.trialDefaultPrice
        : Number(booking.expectedAmount));
    const amount = clampTrialPrice(baseAmount, settings);

    const revenueStaffId =
      booking.customer.assignedStaffId ??
      user.staffId ??
      (() => {
        throw new AppError(
          "FORBIDDEN",
          "顧客尚未指派直屬店長，無法判定營收歸屬",
        );
      })();

    const result = await prisma.$transaction(async (txClient) => {
      const snapshot = await buildTransactionSnapshot(txClient, {
        customerId: booking.customerId,
        storeId,
        revenueStaffId,
        planId: booking.servicePlanId ?? null,
        grossAmount: amount,
        netAmount: amount,
      });

      // wallet-free：不帶 customerPlanWalletId，不建 WalletSession，
      // 不呼叫 assignPlanToCustomer。
      return txClient.transaction.create({
        data: {
          customerId: booking.customerId,
          bookingId: booking.id,
          revenueStaffId,
          serviceStaffId: user.staffId ?? null,
          soldByStaffId: user.staffId ?? null,
          transactionType: "TRIAL_PURCHASE" as TransactionType,
          paymentMethod: data.paymentMethod as PaymentMethod,
          paymentStatus: "SUCCESS",
          paidAt: new Date(),
          amount,
          storeId,
          ...snapshot,
        },
      });
    });

    revalidateBookings(booking.customerId);
    revalidateTransactions(booking.customerId);
    return { success: true, data: { transactionId: result.id } };
  } catch (e) {
    return handleActionError(e);
  }
}
