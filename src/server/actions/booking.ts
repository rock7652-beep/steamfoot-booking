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
// 1. Manager 只能為自己名下顧客預約
// 2. Customer 自助預約：selfBookingEnabled + ACTIVE wallet
// 3. 未來有效預約數 + 1 ≤ 剩餘堂數（Customer 自助）
// 4. 只能預約未來 14 天內
// 5. 時段必須 enabled 且未額滿
// 6. 快照 revenueStaffId = customer.assignedStaffId
// 7. 不扣堂（到店 markCompleted 才扣）
// ============================================================

export async function createBooking(
  input: z.infer<typeof createBookingSchema>
): Promise<ActionResult<{ bookingId: string }>> {
  try {
    const user = await requireSession();
    const data = createBookingSchema.parse(input);

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

    // ── 2. 權限檢查（Manager 現在可為任何顧客預約，共享查看）
    // 不再限制 Manager 只能為自己名下顧客預約

    if (user.role === "CUSTOMER") {
      // 顧客只能為自己預約
      if (!user.customerId || user.customerId !== data.customerId) {
        throw new AppError("FORBIDDEN", "顧客只能為自己建立預約");
      }
      // 必須開啟自助預約
      if (!customer.selfBookingEnabled) {
        throw new AppError("BUSINESS_RULE", "尚未開放自助預約，請聯繫店長");
      }
      // 必須有有效課程且剩餘堂數 > 0
      const hasValidWallet = customer.planWallets.some((w) => w.remainingSessions > 0);
      if (!hasValidWallet) {
        throw new AppError("BUSINESS_RULE", "尚無有效課程或剩餘堂數不足，請先購買課程方案");
      }
    }

    // ── 3. 日期範圍檢查（未來 14 天內）
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

    // ── 4. 顧客自助預約：未來有效預約數 ≤ 剩餘堂數
    if (user.role === "CUSTOMER") {
      const futureBookingCount = await prisma.booking.count({
        where: {
          customerId: data.customerId,
          bookingStatus: { in: ["PENDING", "CONFIRMED"] },
          bookingDate: { gte: today },
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

    // ── 5. 時段可用性檢查
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

    const bookedCount = await prisma.booking.count({
      where: {
        bookingDate: bookingDateObj,
        slotTime: data.slotTime,
        bookingStatus: { in: ["PENDING", "CONFIRMED"] },
      },
    });
    if (bookedCount >= slot.capacity) {
      throw new AppError("BUSINESS_RULE", "該時段已額滿，請選擇其他時段");
    }

    // ── 6. 決定 bookedByType / bookedByStaffId
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

    // ── 7. 建立預約（快照 revenueStaffId，不扣堂）
    const booking = await prisma.booking.create({
      data: {
        customerId: data.customerId,
        bookingDate: bookingDateObj,
        slotTime: data.slotTime,
        revenueStaffId: customer.assignedStaffId ?? null, // 快照（nullable: 顧客可能尚未指派店長）
        bookedByType,
        bookedByStaffId,
        bookingType: data.bookingType,
        servicePlanId: data.servicePlanId ?? null,
        customerPlanWalletId: data.customerPlanWalletId ?? null,
        bookingStatus: "CONFIRMED",
        notes: data.notes,
      },
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

    // 若修改日期/時段，需重新檢查可用性
    if (data.bookingDate || data.slotTime) {
      const newDate = data.bookingDate
        ? new Date(data.bookingDate + "T00:00:00")
        : booking.bookingDate;
      const newSlot = data.slotTime ?? booking.slotTime;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (newDate < today) throw new AppError("VALIDATION", "不能改到過去的日期");

      const dayOfWeek = newDate.getDay();
      const slot = await prisma.bookingSlot.findFirst({
        where: { dayOfWeek, startTime: newSlot, isEnabled: true },
      });
      if (!slot) throw new AppError("VALIDATION", "目標時段不可用");

      const bookedCount = await prisma.booking.count({
        where: {
          bookingDate: newDate,
          slotTime: newSlot,
          bookingStatus: { in: ["PENDING", "CONFIRMED"] },
          NOT: { id: bookingId }, // 排除自己
        },
      });
      if (bookedCount >= slot.capacity) {
        throw new AppError("BUSINESS_RULE", "目標時段已額滿");
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.bookingDate) updateData.bookingDate = new Date(data.bookingDate + "T00:00:00");
    if (data.slotTime) updateData.slotTime = data.slotTime;
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
// Owner: 任意預約
// Manager: 自己名下
// Customer: 自己的 PENDING / CONFIRMED 預約
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

    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        bookingStatus: "CANCELLED",
        notes: note ? `[取消] ${note}` : booking.notes,
      },
    });

    revalidatePath("/dashboard/bookings");
    revalidatePath("/book");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// markCompleted
//
// 到店完成後：
// 1. 更新 bookingStatus = COMPLETED
// 2. 若 PACKAGE_SESSION + wallet → 扣堂
// 3. 若 remainingSessions = 0 → wallet.status = USED_UP
// 4. 建立 SESSION_DEDUCTION Transaction
// 5. 若無其他 ACTIVE wallet → 顧客 stage = INACTIVE
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

    // Manager 只能標記自己名下顧客的預約
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
          serviceStaffId,
        },
      });

      // 2. 扣堂（只有 PACKAGE_SESSION 且有綁定錢包）
      if (
        booking.bookingType === "PACKAGE_SESSION" &&
        booking.customerPlanWallet
      ) {
        const wallet = booking.customerPlanWallet;
        const newRemaining = wallet.remainingSessions - 1;

        await tx.customerPlanWallet.update({
          where: { id: wallet.id },
          data: {
            remainingSessions: newRemaining,
            status: newRemaining <= 0 ? "USED_UP" : "ACTIVE",
          },
        });

        // 3. 建立扣堂交易紀錄（amount = 0，記錄扣堂動作）
        await tx.transaction.create({
          data: {
            customerId: booking.customerId,
            bookingId: booking.id,
            revenueStaffId: booking.revenueStaffId ?? serviceStaffId ?? user.staffId!, // 維持歷史快照，fallback 到服務者
            serviceStaffId,
            customerPlanWalletId: wallet.id,
            transactionType: "SESSION_DEDUCTION",
            paymentMethod: "CASH",
            amount: 0,
            quantity: 1,
            note: `預約完成扣堂（${booking.bookingDate.toLocaleDateString("zh-TW")} ${booking.slotTime}）`,
          },
        });

        // 4. 若此錢包已用完，確認顧客是否還有其他 ACTIVE wallet
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
// markNoShow — Owner / Manager（自己名下）
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

    // 未到不扣堂
    await prisma.booking.update({
      where: { id: bookingId },
      data: { bookingStatus: "NO_SHOW" },
    });

    revalidatePath("/dashboard/bookings");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}
