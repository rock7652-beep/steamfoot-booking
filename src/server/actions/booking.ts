"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";
import { AppError, handleActionError } from "@/lib/errors";
import { generateSlots } from "@/lib/slot-generator";
import {
  createBookingSchema,
  updateBookingSchema,
  completeBookingSchema,
} from "@/lib/validators/booking";
import { getNowTaipeiHHmm, toLocalDateStr } from "@/lib/date-utils";
import {
  getBookingDateTime,
  PENDING_STATUSES,
  type NoShowChoice,
} from "@/lib/booking-constants";
import { revalidateBookings } from "@/lib/revalidation";
import type { ActionResult } from "@/types";
import { checkBookingLimit } from "@/lib/shop-config";
import { assertStoreAccess } from "@/lib/manager-visibility";
import { currentStoreId } from "@/lib/store";
import type { z } from "zod";

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
    const data = createBookingSchema.parse(input);
    const bookingPeople = data.people ?? 1;
    const isMakeup = data.isMakeup ?? false;

    // ── 0. FREE 方案預約數限制（legacy ShopPlan）
    const bookingLimit = await checkBookingLimit();
    if (!bookingLimit.allowed) {
      return {
        success: false,
        error: `體驗版預約上限 ${bookingLimit.limit} 筆已達，請升級方案以繼續新增`,
      };
    }

    // ── 0.1 PricingPlan 月度預約數限制
    if (user.storeId) {
      const { checkMonthlyBookingLimitOrThrow } = await import("@/lib/usage-gate");
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      const monthlyCount = await prisma.booking.count({
        where: { storeId: user.storeId, createdAt: { gte: monthStart, lte: monthEnd } },
      });
      await checkMonthlyBookingLimitOrThrow(monthlyCount);
    }

    // ── 0.5 檢查營業日 / 公休
    const closureDateObj = new Date(data.bookingDate + "T00:00:00Z");
    const [specialDay, businessHour] = await Promise.all([
      prisma.specialBusinessDay.findUnique({ where: { date: closureDateObj } }),
      prisma.businessHours.findUnique({ where: { dayOfWeek: closureDateObj.getUTCDay() } }),
    ]);
    if (specialDay && (specialDay.type === "closed" || specialDay.type === "training")) {
      return {
        success: false,
        error: `${data.bookingDate} 為${specialDay.type === "training" ? "進修日" : "公休日"}，無法預約`,
      };
    }
    if (!specialDay && businessHour && !businessHour.isOpen) {
      return {
        success: false,
        error: `${data.bookingDate} 為固定公休日，無法預約`,
      };
    }

    // 檢查 SlotOverride（單一時段覆寫，最高優先）
    const slotOverride = data.slotTime
      ? await prisma.slotOverride.findUnique({
          where: { date_startTime: { date: closureDateObj, startTime: data.slotTime } },
        })
      : null;

    if (slotOverride?.type === "disabled") {
      return {
        success: false,
        error: `${data.bookingDate} ${data.slotTime} 時段已被手動關閉${slotOverride.reason ? `（${slotOverride.reason}）` : ""}`,
      };
    }

    // 檢查 slot 時段是否在營業範圍內（特殊時段縮短時攔截）
    // 若 SlotOverride 為 "enabled"，跳過營業範圍檢查（強制開放）
    const dayOpenTime = specialDay?.type === "custom" ? specialDay.openTime : (businessHour?.openTime ?? null);
    const dayCloseTime = specialDay?.type === "custom" ? specialDay.closeTime : (businessHour?.closeTime ?? null);
    if (slotOverride?.type !== "enabled" && dayOpenTime && dayCloseTime && data.slotTime) {
      if (data.slotTime < dayOpenTime || data.slotTime >= dayCloseTime) {
        return {
          success: false,
          error: `${data.bookingDate} 營業時間為 ${dayOpenTime}-${dayCloseTime}，${data.slotTime} 不在營業範圍內`,
        };
      }
    }

    // ── 1. 取顧客（含 ACTIVE wallets）
    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
      include: {
        planWallets: { where: { status: "ACTIVE" } },
      },
    });
    if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");

    // ── 2. 權限檢查
    if (user.role === "CUSTOMER") {
      // 顧客自助預約：驗證 customerId 歸屬（不做跨店檢查，因為顧客只能為自己預約）
      if (!user.customerId || user.customerId !== data.customerId) {
        throw new AppError("FORBIDDEN", "顧客只能為自己建立預約");
      }
      if (!customer.selfBookingEnabled) {
        throw new AppError("BUSINESS_RULE", "尚未開放自助預約，請聯繫店長協助安排");
      }
    } else {
      // 後台員工/管理員代約：才做跨店存取檢查
      assertStoreAccess(user, customer.storeId);
    }

    // ── 3. 補課驗證
    let makeupCreditId: string | null = null;
    if (isMakeup) {
      if (!data.makeupCreditId) {
        throw new AppError("VALIDATION", "補課預約需指定補課資格");
      }
      const credit = await prisma.makeupCredit.findUnique({
        where: { id: data.makeupCreditId },
      });
      if (!credit) throw new AppError("NOT_FOUND", "補課資格不存在");
      if (credit.customerId !== data.customerId)
        throw new AppError("FORBIDDEN", "此補課資格不屬於該顧客");
      if (credit.isUsed)
        throw new AppError("BUSINESS_RULE", "此補課資格已使用");
      if (credit.expiredAt && credit.expiredAt < new Date())
        throw new AppError("BUSINESS_RULE", "此補課資格已過期");
      makeupCreditId = credit.id;
    }

    // ── 4. 一般預約：需有有效課程 + 票券期限 + 人數檢查
    if (!isMakeup && user.role === "CUSTOMER") {
      const hasValidWallet = customer.planWallets.some(
        (w) => w.remainingSessions > 0
      );
      if (!hasValidWallet) {
        throw new AppError(
          "BUSINESS_RULE",
          "目前沒有可使用的方案，請先購買課程方案或聯繫店家協助"
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
            ? `票券期限不足，您目前方案有效期限至 ${latestExpiry}，請選擇期限內日期或聯繫店家`
            : "票券已超過可使用期限，請聯繫店家協助"
        );
      }

      // 人數 vs 剩餘堂數檢查
      const totalRemaining = customer.planWallets.reduce(
        (sum, w) => sum + w.remainingSessions,
        0
      );
      if (bookingPeople > totalRemaining) {
        throw new AppError(
          "BUSINESS_RULE",
          `方案次數不足，無法預約 ${bookingPeople} 人。目前可使用次數僅剩 ${totalRemaining} 次，請調整預約人數或聯繫店家`
        );
      }
    }

    // ── 5. 日期範圍檢查（以台灣時間為準，避免 UTC 伺服器判斷錯誤）
    const todayStr = toLocalDateStr(); // 台灣今天 "YYYY-MM-DD"
    if (data.bookingDate < todayStr) {
      throw new AppError("VALIDATION", "不可預約過去的日期");
    }

    const [ty, tm, td] = todayStr.split("-").map(Number);
    const maxDateObj = new Date(Date.UTC(ty, tm - 1, td + 14));
    const bookingDateObj = new Date(data.bookingDate + "T00:00:00Z");
    if (bookingDateObj > maxDateObj) {
      throw new AppError("BUSINESS_RULE", "只能預約未來 14 天內的時段");
    }

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
    if (!isMakeup && user.role === "CUSTOMER") {
      const pendingCount = await prisma.booking.count({
        where: {
          customerId: data.customerId,
          bookingStatus: { in: [...PENDING_STATUSES] },
          isMakeup: false,
        },
      });
      const totalRemaining = customer.planWallets.reduce(
        (sum, w) => sum + w.remainingSessions,
        0
      );
      if (pendingCount + 1 > totalRemaining) {
        throw new AppError(
          "BUSINESS_RULE",
          `預約數（${pendingCount + 1}）超過剩餘堂數（${totalRemaining}），請先等待現有預約完成`
        );
      }
    }

    // ── 7. 時段可用性檢查（規則即時運算，不查 BookingSlot）
    // 用營業規則生成該日可用時段
    const bhForSlot = await prisma.businessHours.findUnique({ where: { dayOfWeek: bookingDateObj.getUTCDay() } });
    const effectiveOpen = specialDay?.type === "custom" ? specialDay.openTime : (bhForSlot?.openTime ?? null);
    const effectiveClose = specialDay?.type === "custom" ? specialDay.closeTime : (bhForSlot?.closeTime ?? null);
    const effectiveInterval = (specialDay?.type === "custom" ? specialDay.slotInterval : null) ?? bhForSlot?.slotInterval ?? 60;
    const effectiveCapacity = (specialDay?.type === "custom" ? specialDay.defaultCapacity : null) ?? bhForSlot?.defaultCapacity ?? 6;

    if (!effectiveOpen || !effectiveClose) {
      throw new AppError("VALIDATION", "該日尚未設定營業時間");
    }

    // 確認 slotTime 在生成的時段中（或有 enabled 覆寫）
    const generatedSlots = generateSlots(effectiveOpen, effectiveClose, effectiveInterval, effectiveCapacity);
    const matchedSlot = generatedSlots.find((s) => s.startTime === data.slotTime);
    if (!matchedSlot && slotOverride?.type !== "enabled") {
      throw new AppError("VALIDATION", `${data.slotTime} 在該日不是有效時段`);
    }

    // ── 7.5 值班檢查：該時段須有值班人員（OWNER 可略過）
    const skipDutyCheck = data.skipDutyCheck === true && user.role === "ADMIN";
    if (!skipDutyCheck) {
      // 先確認系統是否已啟用值班排班聯動
      const { isDutySchedulingEnabled } = await import("@/lib/shop-config");
      const dutyFeatureInUse = await isDutySchedulingEnabled();
      if (dutyFeatureInUse) {
        const dutyCount = await prisma.dutyAssignment.count({
          where: {
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

    // 取得該時段的實際容量（SlotOverride capacity_change 覆寫）
    const slotCapacity = slotOverride?.type === "capacity_change" && slotOverride.capacity != null
      ? slotOverride.capacity
      : matchedSlot?.capacity ?? effectiveCapacity;

    const bookedAgg = await prisma.booking.aggregate({
      where: {
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
      // 補課預約 → 標記 credit 為已使用
      if (isMakeup && makeupCreditId) {
        await tx.makeupCredit.update({
          where: { id: makeupCreditId },
          data: { isUsed: true },
        });
      }

      return tx.booking.create({
        data: {
          customerId: data.customerId,
          bookingDate: bookingDateObj,
          slotTime: data.slotTime,
          revenueStaffId: customer.assignedStaffId ?? null,
          bookedByType,
          bookedByStaffId,
          bookingType: data.bookingType,
          servicePlanId: data.servicePlanId ?? null,
          customerPlanWalletId: data.customerPlanWalletId ?? null,
          people: bookingPeople,
          isMakeup,
          makeupCreditId,
          bookingStatus: "PENDING", // 統一為「待到店」
          notes: data.notes,
          // 顧客自助預約 → 使用 customer 所屬 storeId（避免 session storeId 與 customer storeId 不一致）
          // 後台代約 → 使用 session storeId
          storeId: user.role === "CUSTOMER" ? customer.storeId : currentStoreId(user),
        },
      });
    });

    revalidateAll(data.customerId);
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
    const user = await requirePermission("booking.update");
    const data = updateBookingSchema.parse(input);

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { customer: true },
    });
    if (!booking) throw new AppError("NOT_FOUND", "預約不存在");
    assertStoreAccess(user, booking.storeId);

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

      // 檢查營業狀態（與 createBooking 同邏輯）
      const [specialDay, businessHour, slotOverride] = await Promise.all([
        prisma.specialBusinessDay.findUnique({ where: { date: newDate } }),
        prisma.businessHours.findUnique({ where: { dayOfWeek: newDate.getUTCDay() } }),
        prisma.slotOverride.findUnique({
          where: { date_startTime: { date: newDate, startTime: newSlot } },
        }),
      ]);

      // SlotOverride: disabled → 不可用
      if (slotOverride?.type === "disabled") {
        throw new AppError("VALIDATION", `${newSlot} 時段已被手動關閉`);
      }

      // 公休/進修 → 不可預約
      if (specialDay && (specialDay.type === "closed" || specialDay.type === "training")) {
        throw new AppError("VALIDATION", "目標日期為公休或進修日");
      }
      if (!specialDay && businessHour && !businessHour.isOpen) {
        throw new AppError("VALIDATION", "目標日期為固定公休日");
      }

      // 用規則驗證時段（不查 BookingSlot）
      const updOpenTime = specialDay?.type === "custom" ? specialDay.openTime : (businessHour?.openTime ?? null);
      const updCloseTime = specialDay?.type === "custom" ? specialDay.closeTime : (businessHour?.closeTime ?? null);
      const updInterval = (specialDay?.type === "custom" ? specialDay.slotInterval : null) ?? businessHour?.slotInterval ?? 60;
      const updDefaultCap = (specialDay?.type === "custom" ? specialDay.defaultCapacity : null) ?? businessHour?.defaultCapacity ?? 6;

      if (slotOverride?.type !== "enabled") {
        if (!updOpenTime || !updCloseTime) {
          throw new AppError("VALIDATION", "目標日期尚未設定營業時間");
        }
        const updGeneratedSlots = generateSlots(updOpenTime, updCloseTime, updInterval, updDefaultCap);
        const updMatchedSlot = updGeneratedSlots.find((s) => s.startTime === newSlot);
        if (!updMatchedSlot) {
          throw new AppError("VALIDATION", `${newSlot} 不在營業時間範圍內`);
        }
      }

      // 容量檢查
      const effectiveCapacity = slotOverride?.type === "capacity_change" && slotOverride.capacity != null
        ? slotOverride.capacity
        : updDefaultCap;

      const bookedAgg = await prisma.booking.aggregate({
        where: {
          bookingDate: newDate,
          slotTime: newSlot,
          bookingStatus: { in: [...PENDING_STATUSES] },
          NOT: { id: bookingId },
        },
        _sum: { people: true },
      });
      const booked = bookedAgg._sum.people ?? 0;
      if (effectiveCapacity - booked < newPeople) {
        throw new AppError("BUSINESS_RULE", "目標時段名額不足");
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.bookingDate)
      updateData.bookingDate = new Date(data.bookingDate + "T00:00:00Z");
    if (data.slotTime) updateData.slotTime = data.slotTime;
    if (data.people !== undefined) updateData.people = data.people;
    if (data.serviceStaffId !== undefined)
      updateData.serviceStaffId = data.serviceStaffId;
    if (data.notes !== undefined) updateData.notes = data.notes;

    await prisma.booking.update({ where: { id: bookingId }, data: updateData });

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
      if (!user.customerId || booking.customerId !== user.customerId)
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
        },
      });

      // 補課取消 → 退回資格
      if (booking.isMakeup && booking.makeupCreditId) {
        await tx.makeupCredit.update({
          where: { id: booking.makeupCreditId },
          data: { isUsed: false },
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
    const user = await requirePermission("booking.update");
    const data = completeBookingSchema.parse(input ?? {});

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: true,
        customerPlanWallet: true,
      },
    });
    if (!booking) throw new AppError("NOT_FOUND", "預約不存在");
    assertStoreAccess(user, booking.storeId);
    if (booking.bookingStatus === "COMPLETED")
      throw new AppError("VALIDATION", "已標記為出席");
    if (booking.bookingStatus === "CANCELLED")
      throw new AppError("BUSINESS_RULE", "已取消的預約無法標記出席");

    const serviceStaffId =
      data.serviceStaffId ?? booking.serviceStaffId ?? null;

    await prisma.$transaction(async (tx) => {
      // 1. 標記出席
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          bookingStatus: "COMPLETED",
          isCheckedIn: true, // 向後相容
          serviceStaffId,
        },
      });

      // 2. 扣堂 + 寫使用紀錄（非補課才扣）
      const wallet = booking.customerPlanWallet;
      if (wallet && !booking.isMakeup) {
        const newRemaining = Math.max(0, wallet.remainingSessions - 1);
        await tx.customerPlanWallet.update({
          where: { id: wallet.id },
          data: {
            remainingSessions: newRemaining,
            status: newRemaining <= 0 ? "USED_UP" : "ACTIVE",
          },
        });

        // 使用紀錄
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
            note: `出席（${booking.bookingDate.toISOString().slice(0, 10)} ${booking.slotTime}）`,
            storeId: currentStoreId(user),
          },
        });

        // 3. 若錢包歸零 → 檢查是否還有其他 ACTIVE wallet
        if (newRemaining <= 0) {
          const otherActiveWallets = await tx.customerPlanWallet.count({
            where: {
              customerId: booking.customerId,
              status: "ACTIVE",
              NOT: { id: wallet.id },
            },
          });
          if (otherActiveWallets === 0) {
            await tx.customer.update({
              where: { id: booking.customerId },
              data: { customerStage: "INACTIVE", selfBookingEnabled: false },
            });
          }
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
// markNoShow（未到）
//
// 三選一（UI 層 NoShowChoice → DB 層拆成兩欄位）：
//
// 1. DEDUCTED（扣堂）
//    → noShowPolicy = "DEDUCTED", noShowMakeupGranted = false
//    → 扣堂 + 寫 SESSION_DEDUCTION + 不給補課
//
// 2. NOT_DEDUCTED_WITH_MAKEUP（不扣堂＋給補課）
//    → noShowPolicy = "NOT_DEDUCTED", noShowMakeupGranted = true
//    → 不扣堂 + 建 makeupCredit（30天）
//
// 3. NOT_DEDUCTED_NO_MAKEUP（不扣堂、不補課）
//    → noShowPolicy = "NOT_DEDUCTED", noShowMakeupGranted = false
//    → 不扣堂 + 不建 makeupCredit
// ============================================================

export async function markNoShow(
  bookingId: string,
  choice: NoShowChoice = "NOT_DEDUCTED_NO_MAKEUP"
): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("booking.update");

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { customer: true, customerPlanWallet: true },
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
    const shouldDeduct = choice === "DEDUCTED";
    const shouldGrantMakeup = choice === "NOT_DEDUCTED_WITH_MAKEUP";
    const dbPolicy = shouldDeduct ? "DEDUCTED" : "NOT_DEDUCTED";

    await prisma.$transaction(async (tx) => {
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
      const wallet = booking.customerPlanWallet;
      if (shouldDeduct && wallet && !booking.isMakeup) {
        const newRemaining = Math.max(0, wallet.remainingSessions - 1);
        await tx.customerPlanWallet.update({
          where: { id: wallet.id },
          data: {
            remainingSessions: newRemaining,
            status: newRemaining <= 0 ? "USED_UP" : "ACTIVE",
          },
        });

        await tx.transaction.create({
          data: {
            customerId: booking.customerId,
            bookingId: booking.id,
            revenueStaffId:
              booking.revenueStaffId ?? user.staffId!,
            customerPlanWalletId: wallet.id,
            transactionType: "SESSION_DEDUCTION",
            paymentMethod: "CASH",
            amount: 0,
            quantity: 1,
            note: `未到扣堂（${booking.bookingDate.toISOString().slice(0, 10)} ${booking.slotTime}）`,
            storeId: currentStoreId(user),
          },
        });
      }

      // 3. 若不扣堂＋給補課 → 建 makeupCredit
      if (!booking.isMakeup && shouldGrantMakeup) {
        const expiredAt = new Date();
        expiredAt.setDate(expiredAt.getDate() + 30);
        await tx.makeupCredit.create({
          data: {
            customerId: booking.customerId,
            originalBookingId: booking.id,
            isUsed: false,
            expiredAt,
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
    const user = await requirePermission("booking.update");

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: true,
        customerPlanWallet: true,
      },
    });
    if (!booking) throw new AppError("NOT_FOUND", "預約不存在");
    assertStoreAccess(user, booking.storeId);

    const st = booking.bookingStatus;
    if (st === "PENDING" || st === "CONFIRMED") {
      throw new AppError("VALIDATION", "預約已是待到店狀態，無需修正");
    }

    await prisma.$transaction(async (tx) => {
      // ── COMPLETED → PENDING ──
      if (st === "COMPLETED") {
        // 退回堂數（非補課才退）
        const wallet = booking.customerPlanWallet;
        if (wallet && !booking.isMakeup) {
          await tx.customerPlanWallet.update({
            where: { id: wallet.id },
            data: {
              remainingSessions: wallet.remainingSessions + 1,
              status: "ACTIVE", // 退回後一定有堂數
            },
          });

          // 刪除此預約的 SESSION_DEDUCTION 交易
          await tx.transaction.deleteMany({
            where: {
              bookingId: booking.id,
              transactionType: "SESSION_DEDUCTION",
            },
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
          },
        });
      }

      // ── NO_SHOW → PENDING ──
      else if (st === "NO_SHOW") {
        const wallet = booking.customerPlanWallet;

        // 若曾扣堂 → 退回
        if (booking.noShowPolicy === "DEDUCTED" && wallet && !booking.isMakeup) {
          await tx.customerPlanWallet.update({
            where: { id: wallet.id },
            data: {
              remainingSessions: wallet.remainingSessions + 1,
              status: "ACTIVE",
            },
          });
          await tx.transaction.deleteMany({
            where: {
              bookingId: booking.id,
              transactionType: "SESSION_DEDUCTION",
            },
          });

          if (booking.customer.customerStage === "INACTIVE") {
            await tx.customer.update({
              where: { id: booking.customerId },
              data: { customerStage: "ACTIVE", selfBookingEnabled: true },
            });
          }
        }

        // 若曾發補課資格 → 刪除（前提：該 credit 尚未被用於新預約）
        if (booking.noShowMakeupGranted) {
          const credit = await tx.makeupCredit.findUnique({
            where: { originalBookingId: booking.id },
          });
          if (credit) {
            if (credit.isUsed) {
              throw new AppError(
                "BUSINESS_RULE",
                "此筆未到已產生的補課資格已被使用，無法修正。請先取消補課預約後再修正。"
              );
            }
            await tx.makeupCredit.delete({
              where: { id: credit.id },
            });
          }
        }

        await tx.booking.update({
          where: { id: bookingId },
          data: {
            bookingStatus: "PENDING",
            noShowPolicy: null,
            noShowMakeupGranted: null,
          },
        });
      }

      // ── CANCELLED → PENDING ──
      else if (st === "CANCELLED") {
        // 補課預約取消時已退回 credit → 恢復時重新標記為已使用
        if (booking.isMakeup && booking.makeupCreditId) {
          const credit = await tx.makeupCredit.findUnique({
            where: { id: booking.makeupCreditId },
          });
          if (credit && !credit.isUsed) {
            await tx.makeupCredit.update({
              where: { id: booking.makeupCreditId },
              data: { isUsed: true },
            });
          }
        }

        await tx.booking.update({
          where: { id: bookingId },
          data: {
            bookingStatus: "PENDING",
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
