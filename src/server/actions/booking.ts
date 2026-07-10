"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import {
  requireWritablePermission,
} from "@/lib/permissions";
import {
  assertStoreSubscriptionWritable,
  BOOKING_EXPIRED_MESSAGE,
} from "@/lib/subscription-guard";
import { AppError, handleActionError } from "@/lib/errors";
import {
  createBookingSchema,
  updateBookingSchema,
  completeBookingSchema,
} from "@/lib/validators/booking";
import { getNowTaipeiHHmm, toLocalDateStr, dayRange } from "@/lib/date-utils";
import {
  getBookingDateTime,
  PENDING_STATUSES,
  NO_SHOW_MAKEUP_VALID_DAYS,
  type NoShowChoice,
} from "@/lib/booking-constants";
import { revalidateBookings } from "@/lib/revalidation";
import { sortWalletsByFEFO } from "@/lib/wallet-sort";
import {
  applySlotOverrides,
  loadDayBusinessHoursContext,
} from "@/lib/business-hours-resolver";
import type { ActionResult } from "@/types";
import { checkBookingLimit, resolveBookableUntilDate } from "@/lib/shop-config";
import { assertStoreAccess } from "@/lib/manager-visibility";
import { currentStoreId } from "@/lib/store";
import {
  assertCustomerInOperationStore,
  assertSameStore,
} from "@/lib/store-consistency";
import {
  getStoreOperatingStatus,
  getStoreUnavailableMessage,
  isStoreBookableStatus,
} from "@/lib/store-operating-status";
import {
  createBookingCreatedEvent,
  createBookingCompletedEvent,
} from "@/server/services/referral-events";
import { awardFirstBookingReferralPointsIfEligible } from "@/server/services/referral-points";
// PR-H3 清理：PR #194 之後 createBooking 走 allocateSessionsFefo，revert 走
// reReserveSessionsFefo；單 wallet 版本不再被 booking.ts 直接使用 → 移除 unused import。
import {
  allocateSessionsFefo,
  releaseSessions,
  partialReleaseSessions,
  completeSessions,
  uncompleteSessions,
  reReserveSessionsFefo,
} from "@/server/services/wallet-session";
import { Prisma } from "@prisma/client";
// PR-1.5a：Booking.revenueStaffId 快照規則 helper（鎖定 + 防回歸）。
// 規則與禁止項見該 helper 的 JSDoc 與 spec §3.4。
import { snapshotRevenueStaffForBooking } from "./booking-helpers";
import type { z } from "zod";

async function assertStaffBookingWritable(
  user: Awaited<ReturnType<typeof requireSession>>,
): Promise<void> {
  if (user.role === "ADMIN" || user.role === "CUSTOMER") return;
  const { resolveStoreViewContextFromCookie } = await import(
    "@/lib/store-view-context-server"
  );
  const { assertWritableStoreViewContext } = await import(
    "@/lib/store-organization"
  );
  const ctx = await resolveStoreViewContextFromCookie(user);
  if (ctx) assertWritableStoreViewContext(ctx);
}

// ============================================================
// voidSessionDeductionTxs — 將某筆 booking 的所有 SESSION_DEDUCTION 標為 VOIDED
// （取代既有 deleteMany；交易不可硬刪除，全部走軟刪除 + audit log）
// 規格：交易模組 v1
// ============================================================
async function voidSessionDeductionTxs(
  tx: Prisma.TransactionClient,
  params: { bookingId: string; actorUserId: string; reason: string },
) {
  const targets = await tx.transaction.findMany({
    where: {
      bookingId: params.bookingId,
      transactionType: "SESSION_DEDUCTION",
      status: { not: "VOIDED" },
    },
    select: { id: true, storeId: true, status: true },
  });
  if (targets.length === 0) return;

  const now = new Date();
  await tx.transaction.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: {
      status: "VOIDED",
      voidedAt: now,
      voidedByUserId: params.actorUserId,
      voidReason: params.reason,
    },
  });

  for (const t of targets) {
    await tx.transactionAuditLog.create({
      data: {
        storeId: t.storeId,
        transactionId: t.id,
        actorUserId: params.actorUserId,
        action: "VOID",
        beforeJson: { status: t.status } as Prisma.InputJsonValue,
        afterJson: { status: "VOIDED", voidedAt: now.toISOString() } as Prisma.InputJsonValue,
        reason: params.reason,
      },
    });
  }
}

// 共用 revalidate
function revalidateAll(customerId?: string) {
  revalidateBookings(customerId);
}

// ============================================================
// createBooking
//
// 新邏輯（出席才扣堂制）：
// 1. 建立預約，狀態 = PENDING（「待到店」）
// 2. 不扣堂（堂數在 markCompleted 時才扣）
// 3. 補課預約：標記 credit 為已使用
// 4. 預約數限制：remainingSessions - count(PENDING bookings) > 0
// ============================================================

export async function createBooking(
  input: z.infer<typeof createBookingSchema>
): Promise<ActionResult<{ bookingId: string }>> {
  try {
    const user = await requireSession();
    await assertStaffBookingWritable(user);
    const data = createBookingSchema.parse(input);
    const bookingPeople = data.people ?? 1;
    const requestedMakeup = data.isMakeup ?? false;
    // 補課券有效性以「預約日期」當天 00:00（台灣）為界，而非操作當下 now。
    // 補課資格只能在期限內使用，須依「預約 / 課程日期」判斷 expiredAt >= 預約日，
    // 否則會允許用對該預約日已過期的券（例：到 6/15 的券去預約 6/22）。
    const makeupValidFrom = dayRange(data.bookingDate).start;

    // ── 0. FREE 方案預約數限制
    const bookingLimit = await checkBookingLimit(currentStoreId(user));
    if (!bookingLimit.allowed) {
      return {
        success: false,
        error: `體驗版預約上限 ${bookingLimit.limit} 筆已達，請升級方案以繼續新增`,
      };
    }

    // ── 0.1 PricingPlan 月度預約數限制
    // 必須傳 user.storeId — 否則 checkMonthlyBookingLimitOrThrow 會走
    // getCurrentStoreForPlan() 內的 requireStaffSession()，CUSTOMER 自助預約即被擋。
    if (user.storeId) {
      const { checkMonthlyBookingLimitOrThrow } = await import("@/lib/usage-gate");
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      const monthlyCount = await prisma.booking.count({
        where: { storeId: user.storeId, createdAt: { gte: monthStart, lte: monthEnd } },
      });
      await checkMonthlyBookingLimitOrThrow(monthlyCount, user.storeId);
    }

    // ── 0.4 訂閱到期保護：到期店家不可建立新預約（店長後台 + 顧客 LIFF 共用此 SoT；
    //         無訂閱店不擋；通用訊息店長/顧客都看得懂）
    const storeId = currentStoreId(user);
    const operatingStatus = await getStoreOperatingStatus(storeId);
    if (!isStoreBookableStatus(operatingStatus)) {
      throw new AppError("BUSINESS_RULE", getStoreUnavailableMessage(operatingStatus));
    }
    await assertStoreSubscriptionWritable(storeId, {
      message: BOOKING_EXPIRED_MESSAGE,
    });

    // ── 0.45 店鋪可預約日期上限（含當日）
    // 前台與後台都必須遵守 ShopConfig.bookableUntilDate；未設定時沿用
    // resolveBookableUntilDate(null) 的預設視窗。這裡先擋超出店鋪開放日，
    // 避免後台手動送未開放日期繞過 UI。
    const todayStr = toLocalDateStr(); // 台灣今天 "YYYY-MM-DD"
    if (data.bookingDate < todayStr) {
      throw new AppError("VALIDATION", "不可預約過去的日期");
    }

    const sc = await prisma.shopConfig.findUnique({
      where: { storeId },
      select: { bookableUntilDate: true },
    });
    const bookableUntil = resolveBookableUntilDate(sc?.bookableUntilDate);
    // 字串比較即年代順序；含當日 → 僅當超過上限才擋
    if (data.bookingDate > bookableUntil) {
      throw new AppError(
        "BUSINESS_RULE",
        user.role === "CUSTOMER"
          ? "次月預約時段尚未開放，請等候店長通知。"
          : `店鋪目前僅開放預約至 ${bookableUntil}，請先到營業時間設定開放日期。`,
      );
    }

    // ── 0.5 檢查營業日 / 公休（共用 resolver，與後台/前台月曆同源）
    const dayCtx = await loadDayBusinessHoursContext(storeId, data.bookingDate);

    if (dayCtx.rule.closed) {
      const reasonLabel = dayCtx.rule.status === "training" ? "進修日" : "公休日";
      return {
        success: false,
        error: `${data.bookingDate} 為${reasonLabel}，無法預約`,
      };
    }

    // 檢查 SlotOverride（單一時段覆寫，最高優先）
    const slotOverride = data.slotTime
      ? dayCtx.slotOverrides.find((o) => o.startTime === data.slotTime) ?? null
      : null;

    if (slotOverride?.type === "disabled") {
      return {
        success: false,
        error: `${data.bookingDate} ${data.slotTime} 時段已被手動關閉${slotOverride.reason ? `（${slotOverride.reason}）` : ""}`,
      };
    }

    // ── 0.7 解析 canonical customerId（顧客自助流程不信任 client 傳入）
    //
    // 顧客自助場景：session.customerId 可能 stale（顧客資料 merge / placeholder /
    // 跨環境 JWT），透過 customer-identity contract 取得當前 user 對應的真實 Customer。
    // 客戶端傳什麼 customerId 都不影響 — server 強制覆寫成 session 對應的那筆。
    //
    // 員工/管理員代約：input.customerId 才是要操作的 target，照舊使用。
    let effectiveCustomerId = data.customerId;
    if (user.role === "CUSTOMER") {
      const { getCanonicalCustomerIdForSession } = await import("@/lib/customer-identity");
      const canonicalId = await getCanonicalCustomerIdForSession(user);
      if (!canonicalId) {
        throw new AppError(
          "UNAUTHORIZED",
          "找不到您的顧客資料，請重新登入後再試",
        );
      }
      // ⚠ 強制覆寫 — 不信任 client 傳入的 customerId
      effectiveCustomerId = canonicalId;
    }

    // ── 1. 取顧客（含 ACTIVE wallets）— 使用 canonical customerId
    const customer = await prisma.customer.findUnique({
      where: { id: effectiveCustomerId },
      include: {
        planWallets: { where: { status: "ACTIVE" } },
      },
    });
    if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");

    // ── 2. 權限檢查
    // CUSTOMER：身份已由 resolveCustomerForUser 驗過；自助預約入口能否使用，
    // 由下方 PACKAGE_SESSION wallet / 期限 / 人數驗證決定，不再用 customer.selfBookingEnabled 擋
    // （該欄位等同「曾經有 wallet」的衍生旗標，會把有方案的顧客誤判為未開放預約）。
    if (user.role !== "CUSTOMER") {
      // 後台員工/管理員代約：才做跨店存取檢查
      assertStoreAccess(user, customer.storeId);
    }
    assertCustomerInOperationStore(customer, storeId);

    if (data.servicePlanId) {
      const servicePlan = await prisma.servicePlan.findUnique({
        where: { id: data.servicePlanId },
        select: { id: true, storeId: true },
      });
      if (!servicePlan) throw new AppError("NOT_FOUND", "課程方案不存在");
      assertSameStore("ServicePlan", servicePlan.storeId, storeId);
    }

    // ── 3. 補課優先抵用（P0 mixed makeup + package）
    //   規則：一張券抵 1 人 / 1 堂；PACKAGE_SESSION 預約自動優先使用
    //   min(有效券數, people) 張補課券；剩餘人數才保留 WalletSession。
    //   - 不信任 client 傳入的 makeupCreditId：實際用哪幾張由下方 transaction 內
    //     依「最早到期(expiredAt ASC)」server 自選並加鎖（FOR UPDATE）。
    //   - 使用的券記錄於 BookingMakeupCredit（join table，source of truth）。
    let makeupCreditId: string | null = null; // legacy 欄位：存第一張（最早到期）券
    if (requestedMakeup) {
      // 補課語意綁定 PACKAGE_SESSION：避免 SINGLE/FIRST_TRIAL + isMakeup 這種
      // 矛盾組合（補課不收款，但 SINGLE 完成時會卡收款 gate → 券被吃卻無法完成）。
      if (data.bookingType !== "PACKAGE_SESSION") {
        throw new AppError(
          "BUSINESS_RULE",
          "補課預約僅適用於課程方案",
        );
      }
    }
    const canApplyMakeup = data.bookingType === "PACKAGE_SESSION";
    // storeId 一併比對（防多店情境：顧客的券屬於某店，僅該店可消耗）。
    const validMakeupCount = canApplyMakeup
      ? await prisma.makeupCredit.count({
        where: {
          customerId: effectiveCustomerId,
          storeId,
          isUsed: false,
          OR: [{ expiredAt: null }, { expiredAt: { gte: makeupValidFrom } }],
        },
      })
      : 0;
    const makeupPeople = Math.min(validMakeupCount, bookingPeople);
    const walletPeople = bookingPeople - makeupPeople;
    const willUseMakeup = makeupPeople > 0;

    // ── 4. 一般預約：需有有效課程 + 票券期限 + 人數檢查
    // 不信任 client 傳入的 customerPlanWalletId — 必須屬於 effectiveCustomerId
    // （customer.planWallets 已用 effectiveCustomerId 撈，所以同表比對即可）
    if (walletPeople > 0 && data.customerPlanWalletId) {
      const walletBelongs = customer.planWallets.some(
        (w) => w.id === data.customerPlanWalletId,
      );
      if (!walletBelongs) {
        throw new AppError(
          "FORBIDDEN",
          "指定的方案不屬於該顧客",
        );
      }
      const selectedWallet = customer.planWallets.find(
        (w) => w.id === data.customerPlanWalletId,
      );
      if (selectedWallet) {
        assertSameStore("CustomerPlanWallet", selectedWallet.storeId, storeId);
      }
    }
    // P0：PACKAGE_SESSION 預約一律要求有效方案（看資料，不看角色）
    // ────────────────────────────────────────────────────────────
    // 系統規則：「只要是 PACKAGE_SESSION，就一定要有可扣堂數」
    //
    // 先前用 `user.role === "CUSTOMER"` gate → STAFF/ADMIN 後台代約完全 bypass
    //   → 沒方案的顧客可被建立 PACKAGE_SESSION → markCompleted 時 wallet=null
    //   → 不扣堂卻顯示為套餐扣堂 → 污染堂數與報表。
    // 改成 bookingType gate → 不論誰操作，PACKAGE_SESSION 都要過 wallet 檢查。
    if (walletPeople > 0 && data.bookingType === "PACKAGE_SESSION") {
      const hasValidWallet = customer.planWallets.some(
        (w) => w.remainingSessions > 0
      );
      if (!hasValidWallet) {
        throw new AppError(
          "BUSINESS_RULE",
          user.role === "CUSTOMER"
            ? "目前沒有可使用的方案，請先購買課程方案或聯繫店家協助"
            : "此顧客目前沒有可用方案，請先指派或購買方案後再建立預約"
        );
      }

      // 票券期限檢查：所有 ACTIVE wallet 都過期 → 阻擋
      const bookingDateObj2 = new Date(data.bookingDate + "T00:00:00Z");
      const hasWalletCoveringDate = customer.planWallets.some(
        (w) =>
          w.remainingSessions > 0 &&
          (!w.expiryDate || w.expiryDate >= bookingDateObj2)
      );
      if (!hasWalletCoveringDate) {
        // 找最晚到期日用於提示
        const latestExpiry = customer.planWallets
          .filter((w) => w.remainingSessions > 0 && w.expiryDate)
          .map((w) => w.expiryDate!.toISOString().slice(0, 10))
          .sort()
          .pop();
        throw new AppError(
          "BUSINESS_RULE",
          latestExpiry
            ? `票券期限不足，方案有效期限至 ${latestExpiry}，請選擇期限內日期`
            : "方案已超過可使用期限，請聯繫店家協助"
        );
      }

      // 人數 vs 剩餘堂數檢查
      const totalRemaining = customer.planWallets.reduce(
        (sum, w) => sum + w.remainingSessions,
        0
      );
      if (walletPeople > totalRemaining) {
        throw new AppError(
          "BUSINESS_RULE",
          `方案次數不足，無法預約 ${bookingPeople} 人。目前可用補課 ${makeupPeople} 張、方案可使用次數僅剩 ${totalRemaining} 次，請調整預約人數或聯繫店家`
        );
      }

      // 沒指定 wallet → 自動綁定 FEFO 第一個可用 wallet（最早到期優先）
      // 防止 booking 建立後 customerPlanWalletId=null → markCompleted 時不扣堂
      // 排序規則：expiryDate ASC（NULL 排最後）→ createdAt ASC → id ASC（穩定）
      if (!data.customerPlanWalletId) {
        const firstUsable = sortWalletsByFEFO(
          customer.planWallets.filter(
            (w) =>
              w.remainingSessions > 0 &&
              (!w.expiryDate || w.expiryDate >= bookingDateObj2)
          )
        )[0];
        if (!firstUsable) {
          throw new AppError(
            "BUSINESS_RULE",
            "找不到可用方案，請先指派或購買方案後再建立預約"
          );
        }
        data.customerPlanWalletId = firstUsable.id;
      }
    }

    const bookingDateObj = new Date(data.bookingDate + "T00:00:00Z");

    // 同日已過時段不可預約（後端強制擋）
    if (data.bookingDate === todayStr) {
      const nowHHmm = getNowTaipeiHHmm();
      if (data.slotTime <= nowHHmm) {
        throw new AppError(
          "BUSINESS_RULE",
          `不可預約已過時段（${data.slotTime} 已過）`
        );
      }
    }

    // ── 6. 預約數限制（出席才扣堂制：remainingSessions - 待到店筆數 > 0）
    // P0：原本 `user.role === "CUSTOMER"` gate 讓店長後台可超量代約 PACKAGE_SESSION
    //     → 完成時超出部分無 session 可扣 → 報表錯誤。改為 bookingType gate。
    if (walletPeople > 0 && data.bookingType === "PACKAGE_SESSION") {
      const reservedSessionCount = await prisma.walletSession.count({
        where: {
          status: "RESERVED",
          wallet: {
            customerId: effectiveCustomerId,
            status: "ACTIVE",
          },
        },
      });
      const totalRemaining = customer.planWallets.reduce(
        (sum, w) => sum + w.remainingSessions,
        0
      );
      if (reservedSessionCount + walletPeople > totalRemaining) {
        throw new AppError(
          "BUSINESS_RULE",
          `預約數（${reservedSessionCount + walletPeople}）超過剩餘堂數（${totalRemaining}），請先等待現有預約完成或補充方案`
        );
      }
    }

    // ── 7. 時段可用性檢查（共用 resolver 套用 SlotOverride 後再比對）
    if (!dayCtx.rule.openTime || !dayCtx.rule.closeTime) {
      throw new AppError("VALIDATION", "該日尚未設定營業時間");
    }
    const resolvedDaySlots = applySlotOverrides(dayCtx.rule, dayCtx.slotOverrides);
    const matchedSlot = resolvedDaySlots.find((s) => s.startTime === data.slotTime && s.isEnabled);
    if (!matchedSlot) {
      throw new AppError("VALIDATION", `${data.slotTime} 在該日不是有效時段`);
    }

    // ── 7.5 值班檢查：該時段須有值班人員（ADMIN 可略過）
    const skipDutyCheck = data.skipDutyCheck === true && user.role === "ADMIN";
    if (!skipDutyCheck) {
      const { isDutySchedulingEnabled } = await import("@/lib/shop-config");
      // 必須帶 storeId，避免 fallback 至 DEFAULT_STORE_ID 設定
      const dutyFeatureInUse = await isDutySchedulingEnabled(storeId);
      if (dutyFeatureInUse) {
        // 必須帶 storeId，避免跨店值班資料污染
        const dutyCount = await prisma.dutyAssignment.count({
          where: {
            storeId,
            date: bookingDateObj,
            slotTime: data.slotTime,
          },
        });
        if (dutyCount === 0) {
          throw new AppError(
            "BUSINESS_RULE",
            `${data.bookingDate} ${data.slotTime} 尚無值班人員安排，無法預約`
          );
        }
      }
    }

    // 取得該時段的實際容量（applySlotOverrides 已處理 capacity_change）
    const slotCapacity = matchedSlot.capacity;

    const bookedAgg = await prisma.booking.aggregate({
      where: {
        storeId,
        bookingDate: bookingDateObj,
        slotTime: data.slotTime,
        bookingStatus: { in: [...PENDING_STATUSES] },
      },
      _sum: { people: true },
    });
    const bookedPeople = bookedAgg._sum.people ?? 0;
    const remaining = slotCapacity - bookedPeople;
    if (remaining < bookingPeople) {
      throw new AppError(
        "BUSINESS_RULE",
        remaining <= 0
          ? "該時段已額滿，請選擇其他時段"
          : `該時段剩餘 ${remaining} 位，無法預約 ${bookingPeople} 位`
      );
    }

    // ── 8. 決定 bookedByType / bookedByStaffId
    let bookedByType: "CUSTOMER" | "STAFF" | "ADMIN";
    let bookedByStaffId: string | null = null;
    if (user.role === "CUSTOMER") {
      bookedByType = "CUSTOMER";
    } else if (user.role === "ADMIN") {
      bookedByType = "ADMIN";
      bookedByStaffId = user.staffId ?? null;
    } else {
      bookedByType = "STAFF";
      bookedByStaffId = user.staffId ?? null;
    }

    // ── 9. 建立預約（不扣堂，狀態 = PENDING）
    const booking = await prisma.$transaction(async (tx) => {
      // 補課抵用：tx 內以「最早到期優先」server 自選 makeupPeople 張有效券並加鎖
      // （FOR UPDATE SKIP LOCKED）→ 不信任 client、防併發 double-spend。people=N 取 N 張；
      // 取不到 N 張（併發被搶/過期）→ 整筆 rollback。使用券記於 BookingMakeupCredit（join table）。
      let pickedCreditIds: string[] = [];
      if (makeupPeople > 0) {
        const picked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "MakeupCredit"
          WHERE "customerId" = ${effectiveCustomerId}
            AND "storeId" = ${storeId}
            AND "isUsed" = false
            AND ("expiredAt" IS NULL OR "expiredAt" >= ${makeupValidFrom})
          ORDER BY "expiredAt" ASC NULLS LAST, "createdAt" ASC
          LIMIT ${makeupPeople}
          FOR UPDATE SKIP LOCKED`;
        if (picked.length < makeupPeople) {
          throw new AppError(
            "CONFLICT",
            "補課資格已被使用或不足，請重新整理後再試",
          );
        }
        pickedCreditIds = picked.map((r) => r.id);
        // legacy 欄位：存第一張（最早到期）券，供向後相容顯示
        makeupCreditId = pickedCreditIds[0];
        await tx.makeupCredit.updateMany({
          where: { id: { in: pickedCreditIds } },
          data: { isUsed: true },
        });
      }

      const created = await tx.booking.create({
        data: {
          customerId: effectiveCustomerId,
          bookingDate: bookingDateObj,
          slotTime: data.slotTime,
          // PR-1.5a 設計鎖定：快照來源只能是 customer.assignedStaffId。
          // 完整規則與禁止項見 snapshotRevenueStaffForBooking 的 JSDoc。
          revenueStaffId: snapshotRevenueStaffForBooking(customer.assignedStaffId),
          bookedByType,
          bookedByStaffId,
          bookingType: data.bookingType,
          servicePlanId: data.servicePlanId ?? null,
          customerPlanWalletId: data.customerPlanWalletId ?? null,
          people: bookingPeople,
          isMakeup: willUseMakeup,
          makeupCreditId,
          bookingStatus: "PENDING", // 統一為「待到店」
          notes: data.notes,
          // 體驗 499 PR-2：金額快照（additive；非體驗預約不傳 → null，行為不變）
          expectedAmount: data.expectedAmount ?? null,
          // 顧客自助預約 → 使用 customer 所屬 storeId（避免 session storeId 與 customer storeId 不一致）
          // 後台代約 → 使用 session storeId
          storeId,
        },
      });

      // PR-NoShow-2：記錄使用的 N 張補課券（join table = source of truth）。
      if (pickedCreditIds.length > 0) {
        await tx.bookingMakeupCredit.createMany({
          data: pickedCreditIds.map((cid) => ({
            bookingId: created.id,
            makeupCreditId: cid,
            customerId: effectiveCustomerId,
            storeId,
          })),
        });
      }

      // 配套單堂明細：剩餘未被補課券抵用的人數 → 跨 wallet FEFO 分配 walletPeople 堂
      // PR #194: people=N 一張 wallet 不夠時，依 FEFO 順序橫跨多張補足
      //   - preferredWalletId = data.customerPlanWalletId (auto-pick FEFO 第一張或 user 明選)
      //   - 跨 wallet 後若實際 primary 與 preferred 不同（preferred 0 堂被略過）→ 更新 booking 欄位
      if (walletPeople > 0 && data.customerPlanWalletId && customer.planWallets.length > 0) {
        const { primaryWalletId } = await allocateSessionsFefo(tx, {
          candidates: customer.planWallets.map((w) => ({
            id: w.id,
            expiryDate: w.expiryDate,
            createdAt: w.createdAt,
            remainingSessions: w.remainingSessions,
          })),
          bookingId: created.id,
          count: walletPeople,
          preferredWalletId: data.customerPlanWalletId,
        });

        if (primaryWalletId && primaryWalletId !== data.customerPlanWalletId) {
          await tx.booking.update({
            where: { id: created.id },
            data: { customerPlanWalletId: primaryWalletId },
          });
          created.customerPlanWalletId = primaryWalletId;
        }
      }

      return created;
    });

    // BOOKING_CREATED 事件埋點（fire-and-forget，失敗不影響預約）
    try {
      await createBookingCreatedEvent({
        storeId: booking.storeId,
        customerId: booking.customerId,
        referrerId: customer.sponsorId ?? null,
        bookingId: booking.id,
        source: user.role === "CUSTOMER" ? "self-booking" : "staff-booking",
      });
    } catch {
      // 埋點失敗不影響主流程
    }

    revalidateAll(effectiveCustomerId);
    return { success: true, data: { bookingId: booking.id } };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// updateBooking
// ============================================================

export async function updateBooking(
  bookingId: string,
  input: z.infer<typeof updateBookingSchema>
): Promise<ActionResult<void>> {
  try {
    const user = await requireWritablePermission("booking.update");
    const data = updateBookingSchema.parse(input);

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { customer: true },
    });
    if (!booking) throw new AppError("NOT_FOUND", "預約不存在");
    assertStoreAccess(user, booking.storeId);
    // 訂閱到期保護：到期店家不可修改預約（無訂閱店不擋）
    await assertStoreSubscriptionWritable(booking.storeId, {
      message: BOOKING_EXPIRED_MESSAGE,
    });

    if (
      booking.bookingStatus === "COMPLETED" ||
      booking.bookingStatus === "CANCELLED"
    ) {
      throw new AppError("BUSINESS_RULE", "已完成或已取消的預約無法修改");
    }

    if (data.bookingDate || data.slotTime || data.people) {
      const newDate = data.bookingDate
        ? new Date(data.bookingDate + "T00:00:00Z")
        : booking.bookingDate;
      const newSlot = data.slotTime ?? booking.slotTime;
      const newPeople = data.people ?? booking.people;

      const td = new Date();
      td.setHours(0, 0, 0, 0);
      if (newDate < td) throw new AppError("VALIDATION", "不能改到過去的日期");

      // 檢查營業狀態（共用 resolver，與 createBooking 同邏輯）
      const updStoreId = booking.storeId ?? currentStoreId(user);
      const newDateStr = newDate.toISOString().slice(0, 10);
      const updCtx = await loadDayBusinessHoursContext(updStoreId, newDateStr);
      const slotOverride = updCtx.slotOverrides.find((o) => o.startTime === newSlot) ?? null;

      if (slotOverride?.type === "disabled") {
        throw new AppError("VALIDATION", `${newSlot} 時段已被手動關閉`);
      }
      if (updCtx.rule.closed) {
        const reasonLabel = updCtx.rule.status === "training" ? "公休或進修日" : "公休日";
        throw new AppError("VALIDATION", `目標日期為${reasonLabel}`);
      }
      if (!updCtx.rule.openTime || !updCtx.rule.closeTime) {
        throw new AppError("VALIDATION", "目標日期尚未設定營業時間");
      }

      const updResolved = applySlotOverrides(updCtx.rule, updCtx.slotOverrides);
      const updMatched = updResolved.find((s) => s.startTime === newSlot && s.isEnabled);
      if (!updMatched) {
        throw new AppError("VALIDATION", `${newSlot} 不在營業時間範圍內`);
      }

      const bookedAgg = await prisma.booking.aggregate({
        where: {
          storeId: updStoreId,
          bookingDate: newDate,
          slotTime: newSlot,
          bookingStatus: { in: [...PENDING_STATUSES] },
          NOT: { id: bookingId },
        },
        _sum: { people: true },
      });
      const booked = bookedAgg._sum.people ?? 0;
      if (updMatched.capacity - booked < newPeople) {
        throw new AppError("BUSINESS_RULE", "目標時段名額不足");
      }
    }

    // PR-H3: people 變動時，PACKAGE_SESSION 非補課需同步 WalletSession。
    // 用 actualReservedCount → newPeople 的 delta 判斷（不是 booking.people → newPeople），
    // 對 PR #193 前的 stale RESERVED 也能 reconcile：
    //   - newPeople > actualReserved → allocate 差額 (allocateSessionsFefo，跨 wallet)
    //   - newPeople < actualReserved → release 差額 (partialReleaseSessions，最大 sessionNo 先放)
    //   - newPeople == actualReserved → 不動 session
    // FIRST_TRIAL / SINGLE / isMakeup → 完全不動 session (不走 wallet)
    const needsSessionSync =
      data.people !== undefined &&
      data.people !== booking.people &&
      booking.bookingType === "PACKAGE_SESSION" &&
      !booking.isMakeup &&
      booking.customerPlanWalletId !== null;

    const updateData: Record<string, unknown> = {};
    if (data.bookingDate)
      updateData.bookingDate = new Date(data.bookingDate + "T00:00:00Z");
    if (data.slotTime) updateData.slotTime = data.slotTime;
    if (data.people !== undefined) updateData.people = data.people;
    if (data.serviceStaffId !== undefined)
      updateData.serviceStaffId = data.serviceStaffId;
    if (data.notes !== undefined) updateData.notes = data.notes;

    if (!needsSessionSync) {
      // 不需 session 同步 → 維持原本單一 update 行為
      await prisma.booking.update({ where: { id: bookingId }, data: updateData });
    } else {
      // people 改了 PACKAGE_SESSION → transaction 包覆 booking update + session sync
      // 任何一步失敗整段 rollback（Booking.people 不會被改）。
      const newPeople = data.people!;
      // 取顧客當下 ACTIVE wallets — allocateSessionsFefo 跨 wallet 用
      const customerWallets = await prisma.customerPlanWallet.findMany({
        where: { customerId: booking.customerId, status: "ACTIVE" },
        select: {
          id: true,
          expiryDate: true,
          createdAt: true,
          remainingSessions: true,
        },
      });

      await prisma.$transaction(async (tx) => {
        // 先讀當下 RESERVED 數 — 對 stale 資料也能 reconcile
        const actualReservedCount = await tx.walletSession.count({
          where: { bookingId, status: "RESERVED" },
        });

        if (newPeople > actualReservedCount) {
          const delta = newPeople - actualReservedCount;
          await allocateSessionsFefo(tx, {
            candidates: customerWallets,
            bookingId,
            count: delta,
            preferredWalletId: booking.customerPlanWalletId,
          });
        } else if (newPeople < actualReservedCount) {
          const delta = actualReservedCount - newPeople;
          await partialReleaseSessions(tx, bookingId, delta);
        }
        // == 不動

        await tx.booking.update({ where: { id: bookingId }, data: updateData });
      });
    }

    revalidateAll();
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// cancelBooking
//
// 新邏輯（出席才扣堂制）：
// - 取消不扣堂（因為建立時根本沒扣）
// - 補課預約取消 → 退回 credit
// ============================================================

export async function cancelBooking(
  bookingId: string,
  note?: string
): Promise<ActionResult<void>> {
  try {
    const user = await requireSession();
    await assertStaffBookingWritable(user);

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { customer: true },
    });
    if (!booking) throw new AppError("NOT_FOUND", "預約不存在");
    assertStoreAccess(user, booking.storeId);

    if (booking.bookingStatus === "COMPLETED")
      throw new AppError("BUSINESS_RULE", "已出席的預約無法取消");
    if (booking.bookingStatus === "CANCELLED")
      throw new AppError("VALIDATION", "預約已取消");

    // 顧客只能取消自己的 + 12hr 限制
    if (user.role === "CUSTOMER") {
      // 走 canonical resolver — session.customerId 可能 stale
      const { getCanonicalCustomerIdForSession } = await import("@/lib/customer-identity");
      const canonicalId = await getCanonicalCustomerIdForSession(user);
      if (!canonicalId || booking.customerId !== canonicalId)
        throw new AppError("FORBIDDEN", "只能取消自己的預約");

      const bookingDateTime = getBookingDateTime(
        booking.bookingDate,
        booking.slotTime
      );
      const hoursUntilBooking =
        (bookingDateTime.getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursUntilBooking < 12) {
        throw new AppError(
          "BUSINESS_RULE",
          "開課前 12 小時內無法自行取消，請直接聯繫店家"
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          bookingStatus: "CANCELLED",
          notes: note ? `[取消] ${note}` : booking.notes,
          // PR-NoShow-2：清掉 legacy 單張券指向。Booking.makeupCreditId 為 @unique，
          // 不清會讓已取消的預約持續佔住該券的唯一槽位 → 顧客重訂該券 / 還原他筆會撞 unique。
          // 非補課預約本欄本就為 null，設 null 為 no-op，安全。
          makeupCreditId: null,
        },
      });

      // 補課取消 → 退回全部使用的補課券（PR-NoShow-2：people=N → N 張）
      // 讀 join table 取全部券；刪除 link（釋放，讓券可再被預約）；券改回 isUsed=false。
      if (booking.isMakeup) {
        const links = await tx.bookingMakeupCredit.findMany({
          where: { bookingId },
          select: { makeupCreditId: true },
        });
        const creditIds = links.map((l) => l.makeupCreditId);
        // legacy fallback：舊資料若無 join row 但有單一 makeupCreditId
        if (creditIds.length === 0 && booking.makeupCreditId) {
          creditIds.push(booking.makeupCreditId);
        }
        if (creditIds.length > 0) {
          await tx.makeupCredit.updateMany({
            where: { id: { in: creditIds } },
            data: { isUsed: false },
          });
          await tx.bookingMakeupCredit.deleteMany({ where: { bookingId } });
        }
      }

      // 釋放單堂明細 RESERVED → AVAILABLE（補課 / 舊資料無 row 則 no-op）
      // multi-person：對該 booking 的全部 RESERVED row 操作
      await releaseSessions(tx, bookingId);
    });

    revalidateAll(booking.customerId);
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// markCompleted（出席）
//
// 新邏輯：只有出席才扣堂 + 寫使用紀錄
// 1. bookingStatus = COMPLETED
// 2. wallet.remainingSessions -= 1（此時才扣堂）
// 3. 建立 SESSION_DEDUCTION 交易（使用紀錄）
// 4. 若錢包歸零 → 顧客 stage = INACTIVE
// ============================================================

export async function markCompleted(
  bookingId: string,
  input?: z.infer<typeof completeBookingSchema>
): Promise<ActionResult<void>> {
  try {
    const user = await requireWritablePermission("booking.update");
    const data = completeBookingSchema.parse(input ?? {});

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: true,
        customerPlanWallet: true,
        makeupCreditLinks: { select: { makeupCreditId: true } },
      },
    });
    if (!booking) throw new AppError("NOT_FOUND", "預約不存在");
    assertStoreAccess(user, booking.storeId);
    if (booking.bookingStatus === "COMPLETED")
      throw new AppError("VALIDATION", "已標記為出席");
    if (booking.bookingStatus === "CANCELLED")
      throw new AppError("BUSINESS_RULE", "已取消的預約無法標記出席");

    // P0：PACKAGE_SESSION 預約必須綁定有效方案才能完成
    // 防止舊資料 / 跨環境 import 留下無方案的 PACKAGE_SESSION booking 被靜默
    // 標記出席而不扣堂、卻在報表顯示為「套餐扣堂」
    const bookingPeopleForLedger = booking.people ?? 1;
    const makeupLinkCount = booking.makeupCreditLinks?.length ?? 0;
    const legacyAllMakeupWithoutLinks =
      booking.isMakeup && makeupLinkCount === 0 && !booking.customerPlanWallet;
    const fallbackWalletPeople = legacyAllMakeupWithoutLinks
      ? 0
      : Math.max(0, bookingPeopleForLedger - makeupLinkCount);
    if (
      booking.bookingType === "PACKAGE_SESSION" &&
      fallbackWalletPeople > 0 &&
      !booking.customerPlanWallet
    ) {
      throw new AppError(
        "BUSINESS_RULE",
        "此預約沒有綁定可扣堂方案，請先修正方案資料"
      );
    }

    // P0：SINGLE 預約必須先收款才能完成服務
    // 防止「單次不扣堂」漏帳 — markCompleted 不會建 Transaction，沒有收款
    // 直接完成等於白做。改由 collectSinglePayment 先建 SINGLE_PURCHASE
    // SUCCESS 再回頭完成；server 是最後防線（client 顯示 / 隱藏「完成服務」
    // 並非可靠保證）。
    if (booking.bookingType === "SINGLE") {
      const paidSingle = await prisma.transaction.findFirst({
        where: {
          bookingId: booking.id,
          transactionType: "SINGLE_PURCHASE",
          status: "SUCCESS",
        },
        select: { id: true },
      });
      if (!paidSingle) {
        throw new AppError(
          "BUSINESS_RULE",
          "請先完成單次收款後再完成服務",
        );
      }
    }

    const serviceStaffId =
      data.serviceStaffId ?? booking.serviceStaffId ?? null;

    // PR-3d：實際到店人數（FIRST_TRIAL 部分到店）。
    //   - 未傳 → 維持向後相容（attendedPeople 不寫，視為全到）
    //   - 1..booking.people → 寫入
    //   - > booking.people → 拒絕（VALIDATION）
    //   - < booking.people 且 非 FIRST_TRIAL → 拒絕（BUSINESS_RULE，部分到店僅體驗）
    // 不會收到 0（zod min(1)）；0 走 markNoShow 路徑（既有流程）。
    let attendedPeopleToWrite: number | null = null;
    if (data.attendedPeople != null) {
      if (data.attendedPeople > booking.people) {
        throw new AppError(
          "VALIDATION",
          `實際到店人數不可大於預約人數（${booking.people}）`,
        );
      }
      if (
        data.attendedPeople < booking.people &&
        booking.bookingType !== "FIRST_TRIAL"
      ) {
        throw new AppError(
          "BUSINESS_RULE",
          "部分到店目前僅支援體驗預約",
        );
      }
      attendedPeopleToWrite = data.attendedPeople;
    }

    await prisma.$transaction(async (tx) => {
      // 1. 標記出席
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          bookingStatus: "COMPLETED",
          isCheckedIn: true, // 向後相容
          serviceStaffId,
          // PR-3d：null 時不寫入（保留欄位現值）；明確值才寫入。
          ...(attendedPeopleToWrite != null
            ? { attendedPeople: attendedPeopleToWrite }
            : {}),
        },
      });

      // 2. 扣堂 + 寫使用紀錄（只完成已保留的 WalletSession；補課券部分不扣方案）
      // multi-person + multi-wallet：對該 booking 的全部 RESERVED row 操作；
      // 每堂可能來自不同 wallet（FEFO split），SESSION_DEDUCTION 對應寫入。
      const wallet = booking.customerPlanWallet;
      if (wallet) {
        // 優先走單堂明細：RESERVED → COMPLETED（同步所有觸及 wallet 的 counter / status）
        const { completed, items } = await completeSessions(
          tx,
          bookingId,
          new Date(),
        );

        const dateStr = booking.bookingDate.toISOString().slice(0, 10);
        const peopleSuffix =
          booking.people > 1 ? `（${booking.people} 人預約）` : "";

        if (completed > 0) {
          // 每個 session row 各寫 1 筆 SESSION_DEDUCTION，customerPlanWalletId 對應該 session 所屬 wallet
          // (multi-wallet FEFO split：可能來自不同 wallet)
          for (const it of items) {
            await tx.transaction.create({
              data: {
                customerId: booking.customerId,
                bookingId: booking.id,
                revenueStaffId:
                  booking.revenueStaffId ?? serviceStaffId ?? user.staffId!,
                serviceStaffId,
                customerPlanWalletId: it.walletId,
                transactionType: "SESSION_DEDUCTION",
                paymentMethod: "CASH",
                amount: 0,
                quantity: 1,
                note: `出席（${dateStr} ${booking.slotTime}）${peopleSuffix}`,
                storeId: currentStoreId(user),
              },
            });
          }
        } else {
          // Fallback：legacy wallet 無 ledger row → 沿用 counter 邏輯，全扣到 primary wallet
          if (fallbackWalletPeople > 0) {
            const newRemaining = Math.max(
              0,
              wallet.remainingSessions - fallbackWalletPeople,
            );
            await tx.customerPlanWallet.update({
              where: { id: wallet.id },
              data: {
                remainingSessions: newRemaining,
                status: newRemaining <= 0 ? "USED_UP" : "ACTIVE",
              },
            });
            for (let i = 0; i < fallbackWalletPeople; i++) {
              await tx.transaction.create({
                data: {
                  customerId: booking.customerId,
                  bookingId: booking.id,
                  revenueStaffId:
                    booking.revenueStaffId ?? serviceStaffId ?? user.staffId!,
                  serviceStaffId,
                  customerPlanWalletId: wallet.id,
                  transactionType: "SESSION_DEDUCTION",
                  paymentMethod: "CASH",
                  amount: 0,
                  quantity: 1,
                  note: `出席（${dateStr} ${booking.slotTime}）${peopleSuffix}`,
                  storeId: currentStoreId(user),
                },
              });
            }
          }
        }

        // 3. 若顧客所有 ACTIVE wallet 都歸零 → 標 INACTIVE
        // (multi-wallet：不能只看 primary wallet，要看全部)
        const remainingActiveWallets = await tx.customerPlanWallet.count({
          where: { customerId: booking.customerId, status: "ACTIVE" },
        });
        if (remainingActiveWallets === 0) {
          await tx.customer.update({
            where: { id: booking.customerId },
            data: { customerStage: "INACTIVE", selfBookingEnabled: false },
          });
        }
      }
      // 🆕 自動給分：出席 +5（在同一事務內）
      try {
        const { awardPoints } = await import("@/server/actions/points");
        await awardPoints({
          customerId: booking.customerId,
          storeId: booking.storeId,
          type: "ATTENDANCE",
          note: `出席（${booking.bookingDate.toISOString().slice(0, 10)} ${booking.slotTime}）`,
          tx,
        });
      } catch {
        // 積分發放失敗不應阻擋主流程（但仍在事務內，若 tx 出錯會回滾）
        console.error("[Points] Failed to award ATTENDANCE points for booking", bookingId);
      }

      // 🆕 推薦獎勵（疊加於 ATTENDANCE +5 之上，不取代）
      // 首次完成 + 有 sponsor → 邀請者 +10、被邀請者 +5
      // sourceKey 以 customerId 為主鍵，確保每位被邀請人只觸發一次
      await awardFirstBookingReferralPointsIfEligible({
        customerId: booking.customerId,
        storeId: booking.storeId,
        tx,
      });
    });

    // BOOKING_COMPLETED 事件埋點（交易外 fire-and-forget；埋點失敗不回滾業務）
    try {
      await createBookingCompletedEvent({
        storeId: booking.storeId,
        customerId: booking.customerId,
        referrerId: booking.customer.sponsorId ?? null,
        bookingId: booking.id,
        source: "mark-completed",
      });
    } catch {
      // 埋點失敗不影響主流程
    }

    revalidateAll(booking.customerId);
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// markNoShow（未到）
//
// 二選一（UI 層 NoShowChoice → DB 層拆成兩欄位）。
// 兩者皆「扣堂」：名額已被佔用，依預約人數 people 原堂照扣、釋出 people 名額。
//
// 1. DEDUCTED（扣堂）
//    → noShowPolicy = "DEDUCTED", noShowMakeupGranted = false
//    → 依人數扣堂 + 寫 N 筆 SESSION_DEDUCTION + 不給補課
//
// 2. DEDUCTED_WITH_MAKEUP（扣堂並給 7 日補課資格）
//    → noShowPolicy = "DEDUCTED", noShowMakeupGranted = true
//    → 依人數扣堂 + 寫 N 筆 SESSION_DEDUCTION + 建 N 張 makeupCredit（7天）
//    → 一張券抵 1 人 / 1 堂；補課預約（isMakeup）的未到不再產生新券
//
// partial attendance（部分出席/部分未到）不在本流程範圍，屬後續更細的設計。
// ============================================================

export async function markNoShow(
  bookingId: string,
  choice: NoShowChoice = "DEDUCTED"
): Promise<ActionResult<void>> {
  try {
    const user = await requireWritablePermission("booking.update");

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: true,
        customerPlanWallet: true,
        makeupCreditLinks: { select: { makeupCreditId: true } },
      },
    });
    if (!booking) throw new AppError("NOT_FOUND", "預約不存在");
    assertStoreAccess(user, booking.storeId);
    if (
      booking.bookingStatus !== "CONFIRMED" &&
      booking.bookingStatus !== "PENDING"
    ) {
      throw new AppError("VALIDATION", "只能對待到店的預約標記未到");
    }

    // 拆解 UI choice → DB 欄位
    // 兩個選項皆「扣堂」（名額已被佔用，原堂照扣）；差別僅在是否額外發補課券。
    const shouldDeduct =
      choice === "DEDUCTED" || choice === "DEDUCTED_WITH_MAKEUP";
    const shouldGrantMakeup = choice === "DEDUCTED_WITH_MAKEUP";
    const dbPolicy = shouldDeduct ? "DEDUCTED" : "NOT_DEDUCTED";
    const bookingPeopleForLedger = booking.people ?? 1;
    const makeupLinkCount = booking.makeupCreditLinks?.length ?? 0;
    const legacyAllMakeupWithoutLinks =
      booking.isMakeup && makeupLinkCount === 0 && !booking.customerPlanWallet;
    const fallbackWalletPeople = legacyAllMakeupWithoutLinks
      ? 0
      : Math.max(0, bookingPeopleForLedger - makeupLinkCount);

    await prisma.$transaction(async (tx) => {
      // 0. race-safe：鎖 Booking row，串行化同 booking 的並發未到/完成/收款。
      //    防雙擊或併發 markNoShow 重複扣堂、重複建立補課券。
      //    鎖定後重查狀態（防 TOCTOU：外層 findUnique 後可能已被別的呼叫 commit）。
      await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`;
      const fresh = await tx.booking.findUnique({
        where: { id: bookingId },
        select: { bookingStatus: true },
      });
      if (!fresh) throw new AppError("NOT_FOUND", "預約不存在");
      if (
        fresh.bookingStatus !== "PENDING" &&
        fresh.bookingStatus !== "CONFIRMED"
      ) {
        throw new AppError("CONFLICT", "預約狀態已變更，請重新整理");
      }

      // 1. 標記未到 + 記錄扣堂策略 + 是否發補課
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          bookingStatus: "NO_SHOW",
          noShowPolicy: dbPolicy,
          noShowMakeupGranted: shouldGrantMakeup,
        },
      });

      // 2. 若扣堂 → 扣 wallet + 寫 usage record
      // multi-person + multi-wallet：people=N 全 RESERVED row → COMPLETED；
      // 寫 N 筆 SESSION_DEDUCTION，每筆 customerPlanWalletId 對應該 session 所屬 wallet
      const wallet = booking.customerPlanWallet;
      if (shouldDeduct && wallet) {
        const { completed, items } = await completeSessions(
          tx,
          bookingId,
          new Date(),
        );

        const dateStr = booking.bookingDate.toISOString().slice(0, 10);
        const peopleSuffix =
          booking.people > 1 ? `（${booking.people} 人預約）` : "";
        // audit：扣堂交易 note 標明是否同時發補課，方便追查
        const noteBase = shouldGrantMakeup
          ? `未到扣堂＋發 ${NO_SHOW_MAKEUP_VALID_DAYS} 日補課`
          : "未到扣堂";

        if (completed > 0) {
          for (const it of items) {
            await tx.transaction.create({
              data: {
                customerId: booking.customerId,
                bookingId: booking.id,
                revenueStaffId: booking.revenueStaffId ?? user.staffId!,
                customerPlanWalletId: it.walletId,
                transactionType: "SESSION_DEDUCTION",
                paymentMethod: "CASH",
                amount: 0,
                quantity: 1,
                note: `${noteBase}（${dateStr} ${booking.slotTime}）${peopleSuffix}`,
                storeId: currentStoreId(user),
              },
            });
          }
        } else {
          // legacy fallback：counter 扣到 primary wallet
          if (fallbackWalletPeople > 0) {
            const newRemaining = Math.max(
              0,
              wallet.remainingSessions - fallbackWalletPeople,
            );
            await tx.customerPlanWallet.update({
              where: { id: wallet.id },
              data: {
                remainingSessions: newRemaining,
                status: newRemaining <= 0 ? "USED_UP" : "ACTIVE",
              },
            });
            for (let i = 0; i < fallbackWalletPeople; i++) {
              await tx.transaction.create({
                data: {
                  customerId: booking.customerId,
                  bookingId: booking.id,
                  revenueStaffId: booking.revenueStaffId ?? user.staffId!,
                  customerPlanWalletId: wallet.id,
                  transactionType: "SESSION_DEDUCTION",
                  paymentMethod: "CASH",
                  amount: 0,
                  quantity: 1,
                  note: `${noteBase}（${dateStr} ${booking.slotTime}）${peopleSuffix}`,
                  storeId: currentStoreId(user),
                },
              });
            }
          }
        }
      } else if (!shouldDeduct && wallet) {
        // 不扣堂未到 → 釋放全部 RESERVED → AVAILABLE（補課 / 舊資料無 row 則 no-op）
        await releaseSessions(tx, bookingId);
      }

      // 3. 若扣堂＋給補課 → 只依方案扣抵的人數建補課券。
      // 混合預約不可把已用補課券的部分再發新券，避免補課券無限複製。
      // 純補課預約 fallbackWalletPeople=0，因此不會產生新券。
      if (shouldGrantMakeup && fallbackWalletPeople > 0) {
        const expiredAt = new Date();
        expiredAt.setDate(expiredAt.getDate() + NO_SHOW_MAKEUP_VALID_DAYS);
        for (let i = 0; i < fallbackWalletPeople; i++) {
          await tx.makeupCredit.create({
            data: {
              customerId: booking.customerId,
              originalBookingId: booking.id,
              isUsed: false,
              expiredAt,
              storeId: booking.storeId,
            },
          });
        }
      }
    });

    revalidateAll(booking.customerId);
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// revertBookingStatus（修正：回滾至 PENDING）
//
// 狀態轉換規則：
// - COMPLETED → PENDING：退回 wallet +1, 刪除 SESSION_DEDUCTION
// - NO_SHOW(DEDUCTED) → PENDING：退回 wallet +1, 刪除 SESSION_DEDUCTION
// - NO_SHOW(NOT_DEDUCTED + 有補課) → PENDING：刪除 makeupCredit
// - NO_SHOW(NOT_DEDUCTED + 無補課) → PENDING：僅恢復狀態
// - CANCELLED → PENDING：若為補課預約 → 重新標記 credit 為已使用
// ============================================================

export async function revertBookingStatus(
  bookingId: string
): Promise<ActionResult<void>> {
  try {
    const user = await requireWritablePermission("booking.update");

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: true,
        customerPlanWallet: true,
        makeupCreditLinks: { select: { makeupCreditId: true } },
      },
    });
    if (!booking) throw new AppError("NOT_FOUND", "預約不存在");
    assertStoreAccess(user, booking.storeId);

    const st = booking.bookingStatus;
    if (st === "PENDING" || st === "CONFIRMED") {
      throw new AppError("VALIDATION", "預約已是待到店狀態，無需修正");
    }
    const bookingPeopleForLedger = booking.people ?? 1;
    const makeupLinkCount = booking.makeupCreditLinks?.length ?? 0;
    const legacyAllMakeupWithoutLinks =
      booking.isMakeup && makeupLinkCount === 0 && !booking.customerPlanWallet;
    const fallbackWalletPeople = legacyAllMakeupWithoutLinks
      ? 0
      : Math.max(0, bookingPeopleForLedger - makeupLinkCount);

    // multi-wallet revert：需要顧客全部 ACTIVE wallets 供 FEFO 重新 reserve
    const customerWallets = await prisma.customerPlanWallet.findMany({
      where: { customerId: booking.customerId, status: "ACTIVE" },
      select: { id: true, expiryDate: true, createdAt: true, remainingSessions: true },
    });

    await prisma.$transaction(async (tx) => {
      // ── COMPLETED → PENDING ──
      if (st === "COMPLETED") {
        // 退回堂數（非補課才退）
        // multi-person：對該 booking 的全部 COMPLETED row 回退
        const wallet = booking.customerPlanWallet;
        if (wallet) {
          // 單堂明細：COMPLETED → RESERVED；無 row 則 fallback 原 counter
          const { uncompleted } = await uncompleteSessions(tx, bookingId);
          if (uncompleted === 0) {
            // legacy fallback：只補回方案扣抵的人數，補課券部分不可補方案堂數
            await tx.customerPlanWallet.update({
              where: { id: wallet.id },
              data: {
                remainingSessions: wallet.remainingSessions + fallbackWalletPeople,
                status: "ACTIVE",
              },
            });
          }

          // 將此預約的所有 SESSION_DEDUCTION 交易標為 VOIDED（voidSessionDeductionTxs
          // 已用 findMany 對全部處理，多人預約 N 筆會一起處理）
          await voidSessionDeductionTxs(tx, {
            bookingId: booking.id,
            actorUserId: user.id,
            reason: "預約由 COMPLETED 回滾為 PENDING",
          });

          // 若顧客被標為 INACTIVE，恢復為 ACTIVE
          if (booking.customer.customerStage === "INACTIVE") {
            await tx.customer.update({
              where: { id: booking.customerId },
              data: { customerStage: "ACTIVE", selfBookingEnabled: true },
            });
          }
        }

        await tx.booking.update({
          where: { id: bookingId },
          data: {
            bookingStatus: "PENDING",
            isCheckedIn: false,
            // PR-3d：還原 COMPLETED → PENDING 時清空實到人數，避免下次完成
            // 時殘留舊值；店長需在 AttendanceModal 重新選擇。
            attendedPeople: null,
          },
        });
      }

      // ── NO_SHOW → PENDING ──
      else if (st === "NO_SHOW") {
        const wallet = booking.customerPlanWallet;

        // 若曾扣堂 → 退回
        // multi-person：對該 booking 的全部 COMPLETED row 回退
        if (booking.noShowPolicy === "DEDUCTED" && wallet) {
          const { uncompleted } = await uncompleteSessions(tx, bookingId);
          if (uncompleted === 0) {
            // legacy fallback：只補回方案扣抵的人數，補課券部分不可補方案堂數
            await tx.customerPlanWallet.update({
              where: { id: wallet.id },
              data: {
                remainingSessions: wallet.remainingSessions + fallbackWalletPeople,
                status: "ACTIVE",
              },
            });
          }
          await voidSessionDeductionTxs(tx, {
            bookingId: booking.id,
            actorUserId: user.id,
            reason: "預約由 NO_SHOW (DEDUCTED) 回滾為 PENDING",
          });

          if (booking.customer.customerStage === "INACTIVE") {
            await tx.customer.update({
              where: { id: booking.customerId },
              data: { customerStage: "ACTIVE", selfBookingEnabled: true },
            });
          }
        }

        // 若曾發補課資格 → 刪除全部（people=N 會有 N 張）
        // 前提：任一張都尚未被用於新預約；只要有一張已使用即不可修正。
        if (booking.noShowMakeupGranted) {
          const credits = await tx.makeupCredit.findMany({
            where: { originalBookingId: booking.id },
          });
          if (credits.some((c) => c.isUsed)) {
            throw new AppError(
              "BUSINESS_RULE",
              "此筆未到已產生的補課資格已被使用，無法修正。請先取消補課預約後再修正。"
            );
          }
          if (credits.length > 0) {
            await tx.makeupCredit.deleteMany({
              where: { originalBookingId: booking.id },
            });
          }
        }

        // 不扣堂未到 → 之前曾 release，回 PENDING 需重新 reserve
        // multi-person + multi-wallet：FEFO 跨 wallet 重新挑 N=booking.people 個 AVAILABLE
        if (
          booking.noShowPolicy !== "DEDUCTED" &&
          wallet &&
          booking.customerPlanWalletId &&
          fallbackWalletPeople > 0
        ) {
          await reReserveSessionsFefo(tx, {
            candidates: customerWallets,
            bookingId,
            count: fallbackWalletPeople,
            preferredWalletId: booking.customerPlanWalletId,
          });
        }

        await tx.booking.update({
          where: { id: bookingId },
          data: {
            bookingStatus: "PENDING",
            noShowPolicy: null,
            noShowMakeupGranted: null,
            // PR-3d：防禦性清空（NO_SHOW 路徑理論上不會寫 attendedPeople，
            // 但若資料殘留，回 PENDING 後應一併清掉以保持乾淨。）
            attendedPeople: null,
          },
        });
      }

      // ── CANCELLED → PENDING ──
      else if (st === "CANCELLED") {
        let restoredMakeupCreditId: string | null = null;
        let restoredMakeupCount = 0;
        let walletPeopleToReserve = booking.people;

        // 取消後恢復視為重新套用目前規則：PACKAGE_SESSION 先用可用補課券，
        // 剩餘人數再重新保留 WalletSession。這能涵蓋全補課與混合預約。
        if (booking.bookingType === "PACKAGE_SESSION") {
          // 有效性與 createBooking 一致：依該 booking 的「預約日期」當天 00:00（台灣）
          // 為界，而非操作當下 now。否則當初合法建立的補課預約取消後，會因「現在」
          // 已過券效期而無法恢復（即使預約日仍在券期限內）。
          const makeupValidFrom = dayRange(
            booking.bookingDate.toISOString().slice(0, 10),
          ).start;
          const picked = await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM "MakeupCredit"
            WHERE "customerId" = ${booking.customerId}
              AND "storeId" = ${booking.storeId}
              AND "isUsed" = false
              AND ("expiredAt" IS NULL OR "expiredAt" >= ${makeupValidFrom})
            ORDER BY "expiredAt" ASC NULLS LAST, "createdAt" ASC
            LIMIT ${booking.people}
            FOR UPDATE SKIP LOCKED`;
          const ids = picked.map((r) => r.id);
          // 防禦：清掉此 booking 任何殘留 join row，避免與重建撞 makeupCreditId @unique。
          await tx.bookingMakeupCredit.deleteMany({ where: { bookingId } });
          if (ids.length > 0) {
            await tx.makeupCredit.updateMany({
              where: { id: { in: ids } },
              data: { isUsed: true },
            });
            await tx.bookingMakeupCredit.createMany({
              data: ids.map((cid) => ({
                bookingId,
                makeupCreditId: cid,
                customerId: booking.customerId,
                storeId: booking.storeId,
              })),
            });
            restoredMakeupCreditId = ids[0];
            restoredMakeupCount = ids.length;
          }
          walletPeopleToReserve = booking.people - restoredMakeupCount;
        }

        // 取消時已 release，恢復需重新 reserve 方案扣抵的人數。
        // multi-person + multi-wallet：FEFO 跨 wallet 重新挑 N=walletPeopleToReserve 個 AVAILABLE。
        if (walletPeopleToReserve > 0 && booking.customerPlanWalletId) {
          await reReserveSessionsFefo(tx, {
            candidates: customerWallets,
            bookingId,
            count: walletPeopleToReserve,
            preferredWalletId: booking.customerPlanWalletId,
          });
        }

        await tx.booking.update({
          where: { id: bookingId },
          data: {
            bookingStatus: "PENDING",
            isMakeup: restoredMakeupCount > 0,
            makeupCreditId: restoredMakeupCreditId,
            // PR-3d：CANCELLED 路徑同樣清掉殘留實到人數，保持回 PENDING 後乾淨。
            attendedPeople: null,
          },
        });
      }
    });

    revalidateAll(booking.customerId);
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// checkInBooking — 已棄用，保留向後相容
// 新流程不需要報到步驟，直接從 PENDING → COMPLETED / NO_SHOW
// ============================================================

export async function checkInBooking(
  bookingId: string
): Promise<ActionResult<void>> {
  // 直接 noop，避免呼叫端報錯
  return markCompleted(bookingId);
}

// ============================================================
// markCompletedBatch — 批次完成服務
//
// 現場「一次處理多筆預約」的入口（取代讓店長一筆一筆開 drawer）。
//
// 設計：
// - 序列處理（for-loop）— 同 wallet 多筆預約若並行扣堂可能撞 row lock，
//   而且現場一次幾筆量小，序列已足夠快。
// - 不 fail-fast：一筆出錯仍然繼續處理其他，回傳 per-id 結果讓 UI
//   針對失敗那筆顯示錯誤。
// - 不另開 transaction：每筆 markCompleted 自己有完整的 $transaction，
//   失敗不會污染其他筆。
// ============================================================

export interface BatchActionItemResult {
  id: string;
  success: boolean;
  error?: string;
}

export async function markCompletedBatch(
  ids: string[]
): Promise<{ results: BatchActionItemResult[] }> {
  // 權限檢查交給每筆 markCompleted（內部會 requireWritablePermission）。
  const results: BatchActionItemResult[] = [];
  for (const id of ids) {
    try {
      const r = await markCompleted(id);
      if (r.success) {
        results.push({ id, success: true });
      } else {
        results.push({ id, success: false, error: r.error ?? "操作失敗" });
      }
    } catch (e) {
      results.push({
        id,
        success: false,
        error: e instanceof Error ? e.message : "操作失敗",
      });
    }
  }
  return { results };
}
