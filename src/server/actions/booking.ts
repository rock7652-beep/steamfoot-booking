"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession, requireStaffSession } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";
import { AppError, handleActionError } from "@/lib/errors";
import {
  createBookingSchema,
  updateBookingSchema,
  completeBookingSchema,
} from "@/lib/validators/booking";
import type { ActionResult } from "@/types";
import type { z } from "zod";

// ============================================================
// createBooking
//
// 商業規則（嚴格實作，後端強制）：
// 1. Manager 可為任何顧客預約
// 2. Customer 自助預約：selfBookingEnabled + ACTIVE wallet
// 3. 一般預約：立即預扣 wallet.remainingSessions
// 4. 補課預約：不扣堂，驗證 MakeupCredit 有效且未使用
// 5. 只能預約未來 14 天內
// 6. 時段必須 enabled 且名額足夠
// 7. 快照 revenueStaffId = customer.assignedStaffId
// ============================================================

export async function createBooking(
  input: z.infer<typeof createBookingSchema>
): Promise<ActionResult<{ bookingId: string }>> {
  try {
    const user = await requireSession();
    const data = createBookingSchema.parse(input);
    const bookingPeople = data.people ?? 1;
    const isMakeup = data.isMakeup ?? false;

    // ── 1. 取顧客（含 ACTIVE wallets）
    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
      include: {
        planWallets: {
          where: { status: "ACTIVE" },
        },
      },
    });
    if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");

    // ── 2. 權限檢查
    if (user.role === "CUSTOMER") {
      if (!user.customerId || user.customerId !== data.customerId) {
        throw new AppError("FORBIDDEN", "顧客只能為自己建立預約");
      }
      if (!customer.selfBookingEnabled) {
        throw new AppError("BUSINESS_RULE", "尚未開放自助預約，請聯繫店長");
      }
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
      if (credit.customerId !== data.customerId) {
        throw new AppError("FORBIDDEN", "此補課資格不屬於該顧客");
      }
      if (credit.isUsed) {
        throw new AppError("BUSINESS_RULE", "此補課資格已使用");
      }
      if (credit.expiredAt && credit.expiredAt < new Date()) {
        throw new AppError("BUSINESS_RULE", "此補課資格已過期");
      }
      makeupCreditId = credit.id;
    }

    // ── 4. 一般預約：需有有效課程
    if (!isMakeup && user.role === "CUSTOMER") {
      const hasValidWallet = customer.planWallets.some((w) => w.remainingSessions > 0);
      if (!hasValidWallet) {
        throw new AppError("BUSINESS_RULE", "尚無有效課程或剩餘堂數不足，請先購買課程方案");
      }
    }

    // ── 5. 日期範圍檢查（未來 14 天內）
    const bookingDateObj = new Date(data.bookingDate + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + 14);

    if (bookingDateObj < today) {
      throw new AppError("VALIDATION", "不能預約過去的日期");
    }
    if (bookingDateObj > maxDate) {
      throw new AppError("BUSINESS_RULE", "只能預約未來 14 天內的時段");
    }

    // ── 6. 顧客自助預約（一般）：未來有效預約數 ≤ 剩餘堂數
    if (!isMakeup && user.role === "CUSTOMER") {
      const futureBookingCount = await prisma.booking.count({
        where: {
          customerId: data.customerId,
          bookingStatus: { in: ["PENDING", "CONFIRMED"] },
          bookingDate: { gte: today },
          isMakeup: false, // 只計一般預約
        },
      });

      const totalRemaining = customer.planWallets.reduce(
        (sum, w) => sum + w.remainingSessions,
        0
      );

      if (futureBookingCount + 1 > totalRemaining) {
        throw new AppError(
          "BUSINESS_RULE",
          `未來預約數（${futureBookingCount + 1}）超過剩餘堂數（${totalRemaining}）`
        );
      }
    }

    // ── 7. 時段可用性檢查
    const dayOfWeek = bookingDateObj.getDay();
    const slot = await prisma.bookingSlot.findFirst({
      where: {
        dayOfWeek,
        startTime: data.slotTime,
        isEnabled: true,
      },
    });
    if (!slot) {
      throw new AppError("VALIDATION", `${data.slotTime} 在該日不是有效時段`);
    }

    const bookedAgg = await prisma.booking.aggregate({
      where: {
        bookingDate: bookingDateObj,
        slotTime: data.slotTime,
        bookingStatus: { in: ["PENDING", "CONFIRMED"] },
      },
      _sum: { people: true },
    });
    const bookedPeople = bookedAgg._sum.people ?? 0;
    const remaining = slot.capacity - bookedPeople;
    if (remaining < bookingPeople) {
      throw new AppError(
        "BUSINESS_RULE",
        remaining <= 0
          ? "該時段已額滿，請選擇其他時段"
          : `該時段剩餘 ${remaining} 位，無法預約 ${bookingPeople} 位`
      );
    }

    // ── 8. 決定 bookedByType / bookedByStaffId
    let bookedByType: "CUSTOMER" | "STAFF" | "OWNER";
    let bookedByStaffId: string | null = null;

    if (user.role === "CUSTOMER") {
      bookedByType = "CUSTOMER";
    } else if (user.role === "OWNER") {
      bookedByType = "OWNER";
      bookedByStaffId = user.staffId ?? null;
    } else {
      bookedByType = "STAFF";
      bookedByStaffId = user.staffId ?? null;
    }

    // ── 9. 建立預約 + 預扣堂數（transaction 保一致性）
    const booking = await prisma.$transaction(async (tx) => {
      // 9a. 一般預約且有綁定錢包 → 立即預扣
      if (!isMakeup && data.customerPlanWalletId) {
        const wallet = await tx.customerPlanWallet.findUnique({
          where: { id: data.customerPlanWalletId },
        });
        if (!wallet || wallet.status !== "ACTIVE" || wallet.remainingSessions <= 0) {
          throw new AppError("BUSINESS_RULE", "課程錢包無效或堂數不足");
        }
        const newRemaining = wallet.remainingSessions - 1;
        await tx.customerPlanWallet.update({
          where: { id: wallet.id },
          data: {
            remainingSessions: newRemaining,
            status: newRemaining <= 0 ? "USED_UP" : "ACTIVE",
          },
        });
      }

      // 9b. 補課預約 → 標記 credit 為已使用
      if (isMakeup && makeupCreditId) {
        await tx.makeupCredit.update({
          where: { id: makeupCreditId },
          data: { isUsed: true },
        });
      }

      // 9c. 建立預約
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
          bookingStatus: "CONFIRMED",
          notes: data.notes,
        },
      });
    });

    revalidatePath("/dashboard/bookings");
    revalidatePath("/book");
    return { success: true, data: { bookingId: booking.id } };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// updateBooking — Owner / Manager（自己名下）
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

    if (booking.bookingStatus === "COMPLETED" || booking.bookingStatus === "CANCELLED") {
      throw new AppError("BUSINESS_RULE", "已完成或已取消的預約無法修改");
    }

    // Manager 只能修改自己名下顧客的預約
    if (user.role === "MANAGER") {
      if (!user.staffId || booking.customer.assignedStaffId !== user.staffId) {
        throw new AppError("FORBIDDEN", "無法修改其他店長名下的預約");
      }
    }

    // 若修改日期/時段/人數，需重新檢查可用性
    if (data.bookingDate || data.slotTime || data.people) {
      const newDate = data.bookingDate
        ? new Date(data.bookingDate + "T00:00:00")
        : booking.bookingDate;
      const newSlot = data.slotTime ?? booking.slotTime;
      const newPeople = data.people ?? booking.people;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (newDate < today) throw new AppError("VALIDATION", "不能改到過去的日期");

      const dayOfWeek = newDate.getDay();
      const slot = await prisma.bookingSlot.findFirst({
        where: { dayOfWeek, startTime: newSlot, isEnabled: true },
      });
      if (!slot) throw new AppError("VALIDATION", "目標時段不可用");

      const bookedAgg = await prisma.booking.aggregate({
        where: {
          bookingDate: newDate,
          slotTime: newSlot,
          bookingStatus: { in: ["PENDING", "CONFIRMED"] },
          NOT: { id: bookingId },
        },
        _sum: { people: true },
      });
      const bookedPeople = bookedAgg._sum.people ?? 0;
      const remaining = slot.capacity - bookedPeople;
      if (remaining < newPeople) {
        throw new AppError(
          "BUSINESS_RULE",
          remaining <= 0
            ? "目標時段已額滿"
            : `目標時段剩餘 ${remaining} 位，無法容納 ${newPeople} 人`
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.bookingDate) updateData.bookingDate = new Date(data.bookingDate + "T00:00:00");
    if (data.slotTime) updateData.slotTime = data.slotTime;
    if (data.people !== undefined) updateData.people = data.people;
    if (data.serviceStaffId !== undefined) updateData.serviceStaffId = data.serviceStaffId;
    if (data.notes !== undefined) updateData.notes = data.notes;

    await prisma.booking.update({ where: { id: bookingId }, data: updateData });

    revalidatePath("/dashboard/bookings");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// cancelBooking
//
// 取消規則：
// - 一般預約 (CONFIRMED)：退回預扣堂數 wallet +1
// - 補課預約 (CONFIRMED, isMakeup)：退回 credit.isUsed = false
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

    if (booking.bookingStatus === "COMPLETED") {
      throw new AppError("BUSINESS_RULE", "已完成的預約無法取消");
    }
    if (booking.bookingStatus === "CANCELLED") {
      throw new AppError("VALIDATION", "預約已取消");
    }

    // 顧客只能取消自己的
    if (user.role === "CUSTOMER") {
      if (!user.customerId || booking.customerId !== user.customerId) {
        throw new AppError("FORBIDDEN", "只能取消自己的預約");
      }
    }

    // Manager 只能取消自己名下顧客的
    if (user.role === "MANAGER") {
      if (!user.staffId || booking.customer.assignedStaffId !== user.staffId) {
        throw new AppError("FORBIDDEN", "無法取消其他店長名下的預約");
      }
    }

    await prisma.$transaction(async (tx) => {
      // 1. 標記取消
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          bookingStatus: "CANCELLED",
          notes: note ? `[取消] ${note}` : booking.notes,
        },
      });

      // 2. 一般預約且有綁定錢包 → 退回堂數
      if (!booking.isMakeup && booking.customerPlanWalletId) {
        const wallet = await tx.customerPlanWallet.findUnique({
          where: { id: booking.customerPlanWalletId },
        });
        if (wallet) {
          await tx.customerPlanWallet.update({
            where: { id: wallet.id },
            data: {
              remainingSessions: wallet.remainingSessions + 1,
              status: "ACTIVE", // 退堂後重啟
            },
          });
        }
      }

      // 3. 補課預約 → 退回補課資格
      if (booking.isMakeup && booking.makeupCreditId) {
        await tx.makeupCredit.update({
          where: { id: booking.makeupCreditId },
          data: { isUsed: false },
        });
      }
    });

    revalidatePath("/dashboard/bookings");
    revalidatePath("/book");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// checkInBooking — 報到
// ============================================================

export async function checkInBooking(
  bookingId: string
): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("booking.update");

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { customer: true },
    });
    if (!booking) throw new AppError("NOT_FOUND", "預約不存在");
    if (booking.bookingStatus !== "CONFIRMED") {
      throw new AppError("VALIDATION", "只能對已確認的預約進行報到");
    }

    if (user.role === "MANAGER") {
      if (!user.staffId || booking.customer.assignedStaffId !== user.staffId) {
        throw new AppError("FORBIDDEN", "無法操作其他店長名下的預約");
      }
    }

    await prisma.booking.update({
      where: { id: bookingId },
      data: { isCheckedIn: true },
    });

    revalidatePath("/dashboard/bookings");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// markCompleted
//
// 新邏輯（預扣制）：
// 1. 更新 bookingStatus = COMPLETED, isCheckedIn = true
// 2. 建立 SESSION_DEDUCTION 交易紀錄（記錄完成事實）
// 3. 不再扣堂（已在 createBooking 預扣）
// 4. 若錢包已用完 + 無其他 ACTIVE wallet → 顧客 stage = INACTIVE
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

    if (booking.bookingStatus === "COMPLETED") {
      throw new AppError("VALIDATION", "預約已標記為完成");
    }
    if (booking.bookingStatus === "CANCELLED") {
      throw new AppError("BUSINESS_RULE", "已取消的預約無法標記完成");
    }

    if (user.role === "MANAGER") {
      if (!user.staffId || booking.customer.assignedStaffId !== user.staffId) {
        throw new AppError("FORBIDDEN", "無法操作其他店長名下的預約");
      }
    }

    const serviceStaffId = data.serviceStaffId ?? booking.serviceStaffId ?? null;

    await prisma.$transaction(async (tx) => {
      // 1. 標記完成
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          bookingStatus: "COMPLETED",
          isCheckedIn: true,
          serviceStaffId,
        },
      });

      // 2. 建立交易紀錄（不再扣堂，僅記錄）
      if (booking.customerPlanWallet) {
        const wallet = booking.customerPlanWallet;
        await tx.transaction.create({
          data: {
            customerId: booking.customerId,
            bookingId: booking.id,
            revenueStaffId: booking.revenueStaffId ?? serviceStaffId ?? user.staffId!,
            serviceStaffId,
            customerPlanWalletId: wallet.id,
            transactionType: "SESSION_DEDUCTION",
            paymentMethod: "CASH",
            amount: 0,
            quantity: 1,
            note: booking.isMakeup
              ? `補課完成（${booking.bookingDate.toLocaleDateString("zh-TW")} ${booking.slotTime}）`
              : `預約完成（${booking.bookingDate.toLocaleDateString("zh-TW")} ${booking.slotTime}）`,
          },
        });

        // 3. 若錢包堂數為 0，確認是否還有其他 ACTIVE wallet
        if (wallet.remainingSessions <= 0) {
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
              data: {
                customerStage: "INACTIVE",
                selfBookingEnabled: false,
              },
            });
          }
        }
      }
    });

    revalidatePath("/dashboard/bookings");
    revalidatePath(`/dashboard/customers/${booking.customerId}`);
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// markNoShow
//
// 未到規則：
// 1. 狀態 → NO_SHOW
// 2. 不退堂（已預扣的堂數不回補）
// 3. 自動產生 MakeupCredit（30 天有效）
// ============================================================

export async function markNoShow(bookingId: string): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("booking.update");

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { customer: true },
    });
    if (!booking) throw new AppError("NOT_FOUND", "預約不存在");
    if (booking.bookingStatus !== "CONFIRMED" && booking.bookingStatus !== "PENDING") {
      throw new AppError("VALIDATION", "只能對確認中的預約標記未到");
    }

    if (user.role === "MANAGER") {
      if (!user.staffId || booking.customer.assignedStaffId !== user.staffId) {
        throw new AppError("FORBIDDEN", "無法操作其他店長名下的預約");
      }
    }

    await prisma.$transaction(async (tx) => {
      // 1. 標記未到
      await tx.booking.update({
        where: { id: bookingId },
        data: { bookingStatus: "NO_SHOW" },
      });

      // 2. 自動產生補課資格（30 天有效）
      //    - 只有非補課預約才產生（補課的未到不再給新的補課）
      if (!booking.isMakeup) {
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

    revalidatePath("/dashboard/bookings");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}
