"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  SPA_DEMO_LIVE_FLOW_BOOKING_IDS,
  SPA_DEMO_STORE,
  type SpaDemoBookingNotification,
} from "@/lib/spa-demo-store";
import {
  deliverSpaDemoBookingNotificationBestEffort,
  saveSpaDemoBookingNotification,
} from "@/server/services/spa-demo-booking-notification";

const cancelInputSchema = z.object({
  bookingId: z.enum(SPA_DEMO_LIVE_FLOW_BOOKING_IDS),
  scope: z.enum(["GUEST", "GROUP"]),
});

function revalidateSpaDemoBookingViews() {
  revalidatePath("/liff/manager-preview");
  revalidatePath("/liff/design-preview/booking");
  revalidatePath("/liff/staff-preview");
  revalidatePath("/dashboard/spa-schedule");
  revalidatePath("/staff-schedule");
}

function guestIndex(notes: string | null) {
  return Number(notes?.match(/\|guest=(\d+)/)?.[1] ?? 1);
}

export async function cancelSpaDemoBooking(input: unknown) {
  if (process.env.VERCEL_ENV === "production") {
    return { success: false as const, error: "Demo 取消預約不在正式站開放" };
  }
  const parsed = cancelInputSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "取消資料不完整" };

  try {
    const result = await prisma.$transaction(async (tx) => {
      for (const bookingId of SPA_DEMO_LIVE_FLOW_BOOKING_IDS) {
        await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`;
      }
      const active = await tx.booking.findMany({
        where: {
          id: { in: [...SPA_DEMO_LIVE_FLOW_BOOKING_IDS] },
          storeId: SPA_DEMO_STORE.id,
          bookingStatus: { not: "CANCELLED" },
        },
        select: {
          id: true,
          customerId: true,
          bookingDate: true,
          slotTime: true,
          revenueStaffId: true,
          serviceStaffId: true,
          bookedByType: true,
          bookedByStaffId: true,
          bookingType: true,
          servicePlanId: true,
          treatmentId: true,
          customerPlanWalletId: true,
          bookingStatus: true,
          notes: true,
          treatmentNameSnapshot: true,
          treatmentVariantSnapshot: true,
          treatmentPriceSnapshot: true,
          treatmentServiceMinutesSnapshot: true,
          treatmentBufferMinutesSnapshot: true,
          customer: { select: { storeId: true } },
          serviceStaff: { select: { storeId: true } },
        },
      });
      if (!active.length || active.some((booking) => booking.customer.storeId !== SPA_DEMO_STORE.id || booking.serviceStaff?.storeId !== SPA_DEMO_STORE.id)) {
        throw new Error("SPA_DEMO_BOOKING_NOT_FOUND");
      }
      if (active.some((booking) => !(["PENDING", "CONFIRMED"] as const).includes(booking.bookingStatus as "PENDING" | "CONFIRMED"))) {
        throw new Error("SPA_DEMO_BOOKING_LOCKED");
      }
      if (!active.some((booking) => booking.id === parsed.data.bookingId)) {
        throw new Error("SPA_DEMO_BOOKING_NOT_FOUND");
      }
      const ordered = active.toSorted((left, right) => guestIndex(left.notes) - guestIndex(right.notes));

      if (parsed.data.scope === "GROUP" || active.length === 1) {
        const notification: SpaDemoBookingNotification = {
          kind: "CANCELLED",
          title: "預約已取消",
          date: ordered[0].bookingDate.toISOString().slice(0, 10),
          time: ordered[0].slotTime,
          lines: ordered.map((booking, index) => `${index === 0 ? "第 1 位" : `同行者 ${index + 1}`}・${booking.treatmentNameSnapshot ?? "SPA 服務"}・${booking.treatmentServiceMinutesSnapshot ?? 60} 分鐘`),
          summary: `共 ${ordered.length} 位・整組已取消`,
        };
        await tx.booking.updateMany({
          where: { id: { in: [...SPA_DEMO_LIVE_FLOW_BOOKING_IDS] }, storeId: SPA_DEMO_STORE.id },
          data: { bookingStatus: "CANCELLED" },
        });
        const notificationClaim = await saveSpaDemoBookingNotification(tx, ordered[0].id, notification);
        return { cancelledAll: true, bookingIds: [] as string[], notification, notificationClaim };
      }

      const cancelled = ordered.find((booking) => booking.id === parsed.data.bookingId)!;
      const survivors = ordered.filter((booking) => booking.id !== parsed.data.bookingId);
      const partySize = survivors.length;
      for (const [index, survivor] of survivors.entries()) {
        const targetId = SPA_DEMO_LIVE_FLOW_BOOKING_IDS[index];
        const skills = survivor.notes?.match(/\|skills=([^|]*)/)?.[1] ?? "";
        await tx.booking.update({
          where: { id: targetId },
          data: {
            customerId: survivor.customerId,
            bookingDate: survivor.bookingDate,
            slotTime: survivor.slotTime,
            revenueStaffId: survivor.revenueStaffId,
            serviceStaffId: survivor.serviceStaffId,
            bookedByType: survivor.bookedByType,
            bookedByStaffId: survivor.bookedByStaffId,
            bookingType: survivor.bookingType,
            servicePlanId: survivor.servicePlanId,
            treatmentId: survivor.treatmentId,
            customerPlanWalletId: survivor.customerPlanWalletId,
            bookingStatus: survivor.bookingStatus,
            notes: `SPA_DEMO_LIVE_FLOW|party=${partySize}|guest=${index + 1}|skills=${skills}`,
            treatmentNameSnapshot: survivor.treatmentNameSnapshot,
            treatmentVariantSnapshot: `${partySize} 位同行・第 ${index + 1} 位`,
            treatmentPriceSnapshot: survivor.treatmentPriceSnapshot,
            treatmentServiceMinutesSnapshot: survivor.treatmentServiceMinutesSnapshot,
            treatmentBufferMinutesSnapshot: survivor.treatmentBufferMinutesSnapshot,
          },
        });
      }
      const unusedIds = SPA_DEMO_LIVE_FLOW_BOOKING_IDS.slice(partySize);
      await tx.booking.updateMany({
        where: { id: { in: [...unusedIds] }, storeId: SPA_DEMO_STORE.id },
        data: { bookingStatus: "CANCELLED" },
      });
      const notification: SpaDemoBookingNotification = {
        kind: "CANCELLED",
        title: "同行預約已取消",
        date: cancelled.bookingDate.toISOString().slice(0, 10),
        time: cancelled.slotTime,
        lines: [`已取消・${cancelled.treatmentNameSnapshot ?? "SPA 服務"}・${cancelled.treatmentServiceMinutesSnapshot ?? 60} 分鐘`],
        summary: `其餘 ${partySize} 位預約保留`,
      };
      const notificationClaim = await saveSpaDemoBookingNotification(tx, SPA_DEMO_LIVE_FLOW_BOOKING_IDS[0], notification);
      return { cancelledAll: false, bookingIds: [...SPA_DEMO_LIVE_FLOW_BOOKING_IDS.slice(0, partySize)], notification, notificationClaim };
    });
    await deliverSpaDemoBookingNotificationBestEffort(result.notificationClaim);
    revalidateSpaDemoBookingViews();
    return {
      success: true as const,
      data: {
        cancelledAll: result.cancelledAll,
        bookingIds: result.bookingIds,
        notification: result.notification,
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (message === "SPA_DEMO_BOOKING_LOCKED") return { success: false as const, error: "服務開始或結帳後不能取消預約" };
    if (message === "SPA_DEMO_BOOKING_NOT_FOUND") return { success: false as const, error: "找不到可取消的預約" };
    return { success: false as const, error: "目前無法取消預約，請重新整理後再試" };
  }
}
