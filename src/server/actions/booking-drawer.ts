"use server";

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { getStoreFilter } from "@/lib/manager-visibility";
import { getBookingDetail } from "@/server/queries/booking";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/booking-constants";
import { getTrialSettings } from "@/lib/shop-config";

export interface BookingDrawerPayload {
  booking: {
    id: string;
    bookingDate: string;
    slotTime: string;
    bookingStatus: string;
    bookingType: string;
    people: number;
    isMakeup: boolean;
    isCheckedIn: boolean;
    notes: string | null;
    customer: {
      id: string;
      name: string;
      phone: string;
    };
    revenueStaff: {
      id: string;
      displayName: string;
      colorCode: string;
    } | null;
    serviceStaff: {
      id: string;
      displayName: string;
    } | null;
    servicePlan: {
      id: string;
      name: string;
      price: number;
      sessionCount: number;
      category: string;
    } | null;
    customerPlanWallet: {
      id: string;
      remainingSessions: number;
      totalSessions: number;
      expiryDate: string | null;
      plan: { name: string };
    } | null;
    // 體驗 499 PR-3：建立時的預計收款金額快照（僅 FIRST_TRIAL 有值）
    expectedAmount: number | null;
  };
  customerSummary: {
    totalBookings: number;
    lastVisit: string | null;
    isNewCustomer: boolean;
  };
  // 體驗 499 PR-3：僅 FIRST_TRIAL 預約有此區塊（其他型別一律 null）。
  // collected=true → 已建立 TRIAL_PURCHASE SUCCESS 交易；settings 供收款
  // Modal 決定金額是否可編輯 / 上下限。
  trial: {
    collected: boolean;
    collectedAmount: number | null;
    collectedMethod: string | null;
    collectedAt: string | null;
    settings: {
      allowEdit: boolean;
      defaultPrice: number;
      minPrice: number;
      maxPrice: number;
    };
  } | null;
}

export async function fetchBookingDetail(
  bookingId: string,
): Promise<BookingDrawerPayload> {
  const user = await requireStaffSession();
  const booking = await getBookingDetail(bookingId);

  // 體驗 499 PR-3：僅 FIRST_TRIAL 才查收款狀態 + 體驗價設定
  const isTrial = booking.bookingType === "FIRST_TRIAL";
  const [collectedTx, trialSettings] = isTrial
    ? await Promise.all([
        prisma.transaction.findFirst({
          where: {
            bookingId: booking.id,
            transactionType: "TRIAL_PURCHASE",
            status: "SUCCESS",
          },
          select: { amount: true, paymentMethod: true, paidAt: true },
          orderBy: { createdAt: "desc" },
        }),
        getTrialSettings(booking.storeId),
      ])
    : [null, null];

  // 顧客近況：累積完成 + 最近到店 + 是否新客 — 三查詢並行
  const storeFilter = getStoreFilter(user);
  const [completedAgg, lastVisit, firstBookingCount] = await Promise.all([
    prisma.booking.count({
      where: {
        customerId: booking.customerId,
        bookingStatus: "COMPLETED",
        ...storeFilter,
      },
    }),
    prisma.booking.findFirst({
      where: {
        customerId: booking.customerId,
        bookingStatus: "COMPLETED",
        id: { not: bookingId },
        ...storeFilter,
      },
      select: { bookingDate: true },
      orderBy: { bookingDate: "desc" },
    }),
    prisma.booking.count({
      where: {
        customerId: booking.customerId,
        bookingStatus: { in: [...ACTIVE_BOOKING_STATUSES] },
        ...storeFilter,
      },
    }),
  ]);

  return {
    booking: {
      id: booking.id,
      bookingDate: booking.bookingDate.toISOString().slice(0, 10),
      slotTime: booking.slotTime,
      bookingStatus: booking.bookingStatus,
      bookingType: booking.bookingType,
      people: booking.people,
      isMakeup: booking.isMakeup,
      isCheckedIn: booking.isCheckedIn,
      notes: booking.notes,
      customer: {
        id: booking.customer.id,
        name: booking.customer.name,
        phone: booking.customer.phone,
      },
      revenueStaff: booking.revenueStaff
        ? {
            id: booking.revenueStaff.id,
            displayName: booking.revenueStaff.displayName,
            colorCode: booking.revenueStaff.colorCode,
          }
        : null,
      serviceStaff: booking.serviceStaff
        ? {
            id: booking.serviceStaff.id,
            displayName: booking.serviceStaff.displayName,
          }
        : null,
      servicePlan: booking.servicePlan
        ? {
            id: booking.servicePlan.id,
            name: booking.servicePlan.name,
            price: Number(booking.servicePlan.price),
            sessionCount: booking.servicePlan.sessionCount,
            category: booking.servicePlan.category,
          }
        : null,
      customerPlanWallet: booking.customerPlanWallet
        ? {
            id: booking.customerPlanWallet.id,
            remainingSessions: booking.customerPlanWallet.remainingSessions,
            totalSessions: booking.customerPlanWallet.totalSessions,
            expiryDate:
              booking.customerPlanWallet.expiryDate
                ?.toISOString()
                .slice(0, 10) ?? null,
            plan: { name: booking.customerPlanWallet.plan.name },
          }
        : null,
      expectedAmount:
        booking.expectedAmount == null
          ? null
          : Number(booking.expectedAmount),
    },
    customerSummary: {
      totalBookings: completedAgg,
      lastVisit: lastVisit
        ? lastVisit.bookingDate.toISOString().slice(0, 10)
        : null,
      isNewCustomer: firstBookingCount <= 1,
    },
    trial:
      isTrial && trialSettings
        ? {
            collected: collectedTx != null,
            collectedAmount:
              collectedTx == null ? null : Number(collectedTx.amount),
            collectedMethod: collectedTx?.paymentMethod ?? null,
            collectedAt:
              collectedTx?.paidAt?.toISOString().slice(0, 10) ?? null,
            settings: {
              allowEdit: trialSettings.trialAllowPriceEdit,
              defaultPrice: trialSettings.trialDefaultPrice,
              minPrice: trialSettings.trialMinPrice,
              maxPrice: trialSettings.trialMaxPrice,
            },
          }
        : null,
  };
}
