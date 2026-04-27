"use server";

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { getStoreFilter } from "@/lib/manager-visibility";
import { getBookingDetail } from "@/server/queries/booking";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/booking-constants";

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
  };
  customerSummary: {
    totalBookings: number;
    lastVisit: string | null;
    isNewCustomer: boolean;
  };
}

export async function fetchBookingDetail(
  bookingId: string,
): Promise<BookingDrawerPayload> {
  const user = await requireStaffSession();
  const booking = await getBookingDetail(bookingId);

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
    },
    customerSummary: {
      totalBookings: completedAgg,
      lastVisit: lastVisit
        ? lastVisit.bookingDate.toISOString().slice(0, 10)
        : null,
      isNewCustomer: firstBookingCount <= 1,
    },
  };
}
