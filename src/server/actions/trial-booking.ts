"use server";

import type { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { AppError, handleActionError } from "@/lib/errors";
import { currentStoreId } from "@/lib/store";
import { getTrialSettings, clampTrialTotal } from "@/lib/shop-config";
import { ensureTrialPlan } from "@/server/services/trial-plan";
import { createCustomer } from "@/server/actions/customer";
import { createBooking } from "@/server/actions/booking";
import { listStaffSelectOptions } from "@/server/queries/staff";
import { voidTransaction } from "@/server/actions/transaction";
import {
  createTrialBookingSchema,
  collectTrialPaymentSchema,
  correctTrialCollectionSchema,
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

    // ── 4. 金額快照（PR-3c）：寫入「本次總額」= 單價 × people（未手動改價時自動帶）。
    //      若店長手動傳入 expectedAmount，視為本次總額（不再 × people），一律 clamp。
    //      allowEdit=false 強制 default × people。
    const people = data.people ?? 1;
    const expectedAmount = clampTrialTotal(data.expectedAmount, people, settings);

    // ── 5. 建立 FIRST_TRIAL 預約（複用 createBooking：名額/營業日/值班檢查）
    //      無 customerPlanWalletId → 既有邏輯保證不 allocateSession、不扣堂。
    //      不呼叫 assignPlanToCustomer → 不建 Transaction / Wallet / 營收。
    const result = await createBooking({
      customerId,
      bookingDate: data.bookingDate,
      slotTime: data.slotTime,
      bookingType: "FIRST_TRIAL",
      servicePlanId: trialPlan.id,
      people,
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
        people: true,
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

    // 金額（PR-3c）：以「本次總額」語意處理。
    //   - data.amount 提供 → 視為店長手動輸入之總額（不再 × people）。
    //   - 未提供且 booking.expectedAmount 有值 → 用快照（已是總額）。
    //   - 兩者皆無 → clampTrialTotal 內自帶 default × people。
    // clampTrialTotal 在 allowEdit=false 時強制回 default × people，忽略傳入。
    const people = booking.people || 1;
    const baseAmount =
      data.amount ??
      (booking.expectedAmount == null
        ? undefined
        : Number(booking.expectedAmount));
    const amount = clampTrialTotal(baseAmount, people, settings);

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
      // Race-safe duplicate guard：用 Booking row lock 串行化同一 booking
      // 的並發收款。原本 findFirst 在 transaction 外屬於 TOCTOU 漏洞 — 兩次
      // 快速點擊或重送可能各自通過 guard 後各自 create → 同筆 booking 雙
      // 收款、營收雙算。模式同 collectSinglePayment（PR #166）。
      //
      // 鎖定後（任何同 bookingId 的並發 tx 會 block 在這行）才再次查
      // TRIAL_PURCHASE SUCCESS：能看到任何 winner 已 commit 的交易並拒絕。
      // 不同 bookingId 不互相影響（row-level lock）。
      await txClient.$queryRaw`SELECT id FROM "Booking" WHERE id = ${booking.id} FOR UPDATE`;

      const existing = await txClient.transaction.findFirst({
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

// ============================================================
// correctTrialCollection — 體驗 499 PR-3b：收款更正
//
// 模型：收款更正 = 作廢原 TRIAL_PURCHASE + 重建新 TRIAL_PURCHASE SUCCESS。
// 不改舊交易、不刪、不退款、不直接改金額。複用既有 voidTransaction +
// collectTrialPayment（皆不修改）。
//
// 決策 A：OWNER-only —— gate = requirePermission("transaction.void")。
// 決策 B：僅 bookingStatus ∈ {PENDING, CONFIRMED}（COMPLETED 不做一鍵更正）。
//
// 順序（server-side orchestration，非 client sequencing）：
//   1. transaction.void 權限
//   2. booking 同店 + FIRST_TRIAL + PENDING/CONFIRMED
//   3. originalTransactionId 為同 booking 的 TRIAL_PURCHASE + SUCCESS
//   4. voidTransaction(原交易, reason) —— 失敗即 return，無副作用
//   5. collectTrialPayment(新金額/付款方式) —— 若此步失敗，原交易已 VOIDED，
//      回傳明確訊息：此預約目前未收款，請重新收款（可從 drawer 重收）。
//
// 不做 atomic wrapper：voidTransaction / collectTrialPayment 各自已包
// prisma.$transaction；中間態（已作廢、尚未重收）為合法可復原狀態。
// ============================================================

export async function correctTrialCollection(
  input: z.infer<typeof correctTrialCollectionSchema>,
): Promise<ActionResult<{ transactionId: string }>> {
  try {
    const user = await requirePermission("transaction.void");
    const data = correctTrialCollectionSchema.parse(input);
    const storeId = currentStoreId(user);

    const booking = await prisma.booking.findFirst({
      where: { id: data.bookingId, storeId },
      select: { id: true, bookingType: true, bookingStatus: true },
    });
    if (!booking) throw new AppError("NOT_FOUND", "預約不存在或不屬於本店");
    if (booking.bookingType !== "FIRST_TRIAL") {
      throw new AppError("BUSINESS_RULE", "僅體驗預約可進行收款更正");
    }
    if (
      booking.bookingStatus !== "PENDING" &&
      booking.bookingStatus !== "CONFIRMED"
    ) {
      throw new AppError(
        "BUSINESS_RULE",
        "此預約已完成服務，收款更正請改走交易作廢流程",
      );
    }

    const original = await prisma.transaction.findFirst({
      where: { id: data.originalTransactionId, storeId },
      select: {
        id: true,
        bookingId: true,
        transactionType: true,
        status: true,
      },
    });
    if (!original) {
      throw new AppError("NOT_FOUND", "原收款交易不存在或不屬於本店");
    }
    if (
      original.bookingId !== booking.id ||
      original.transactionType !== "TRIAL_PURCHASE" ||
      original.status !== "SUCCESS"
    ) {
      throw new AppError(
        "BUSINESS_RULE",
        "原收款交易不符（需為此預約的有效體驗收款）",
      );
    }

    // 1) 作廢原交易（含 CAS + TransactionAuditLog + voidReason）
    const voided = await voidTransaction({
      transactionId: data.originalTransactionId,
      reason: data.reason,
    });
    if (!voided.success) {
      return { success: false, error: voided.error };
    }

    // 2) 重新收款（double-collect guard 只擋 SUCCESS，原交易已 VOIDED → 可重收）
    const recollected = await collectTrialPayment({
      bookingId: data.bookingId,
      paymentMethod: data.paymentMethod,
      amount: data.amount,
    });
    if (!recollected.success) {
      return {
        success: false,
        error: `原收款已作廢，但新收款建立失敗（${recollected.error}）。此預約目前為未收款，請重新收款。`,
      };
    }

    return {
      success: true,
      data: { transactionId: recollected.data.transactionId },
    };
  } catch (e) {
    return handleActionError(e);
  }
}
