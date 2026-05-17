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
import { createTrialBookingSchema } from "@/lib/validators/trial-booking";
import type { TrialSettings } from "@/lib/shop-config";
import type { ActionResult } from "@/types";

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
