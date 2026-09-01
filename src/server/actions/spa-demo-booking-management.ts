"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { spaPrisma } from "@/lib/spa-db";
import {
  SPA_DEMO_LIVE_FLOW_BOOKING_IDS,
  SPA_DEMO_STORE,
  type SpaDemoBookingNotification,
} from "@/lib/spa-demo-store";
import {
  deliverSpaDemoBookingNotificationBestEffort,
  saveSpaDemoBookingNotification,
} from "@/server/services/spa-demo-booking-notification";
import { requireSpaStore } from "@/lib/industry-module-server";

const cancelInputSchema = z.object({
  bookingId: z.enum(SPA_DEMO_LIVE_FLOW_BOOKING_IDS),
  scope: z.enum(["GUEST", "GROUP"]),
});

function revalidateSpaDemoBookingViews() {
  revalidatePath("/liff/manager-preview");
  revalidatePath("/liff/design-preview/booking");
  revalidatePath("/liff/staff-preview");
  revalidatePath("/dashboard/bookings");
  revalidatePath("/staff-schedule");
}

export async function cancelSpaDemoBooking(input: unknown) {
  if (process.env.VERCEL_ENV === "production") {
    return { success: false as const, error: "Demo 取消預約不在正式站開放" };
  }
  await requireSpaStore(SPA_DEMO_STORE.id);
  const parsed = cancelInputSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "取消資料不完整" };

  try {
    const result = await spaPrisma.$transaction(async (tx) => {
      for (const bookingId of SPA_DEMO_LIVE_FLOW_BOOKING_IDS) {
        await tx.$queryRaw`SELECT id FROM "SpaBooking" WHERE id = ${bookingId} FOR UPDATE`;
      }
      const active = await tx.spaBooking.findMany({
        where: {
          id: { in: [...SPA_DEMO_LIVE_FLOW_BOOKING_IDS] },
          storeId: SPA_DEMO_STORE.id,
          status: { not: "CANCELLED" },
        },
        select: {
          id: true,
          customerId: true,
          bookingDate: true,
          startTime: true,
          revenueStaffId: true,
          serviceStaffId: true,
          status: true,
          notes: true,
          serviceNameSnapshot: true,
          totalPriceSnapshot: true,
          guestIndex: true,
          items: { select: { serviceMinutes: true } },
        },
      });
      if (!active.length) {
        throw new Error("SPA_DEMO_BOOKING_NOT_FOUND");
      }
      if (active.some((booking) => !(["PENDING", "CONFIRMED"] as const).includes(booking.status as "PENDING" | "CONFIRMED"))) {
        throw new Error("SPA_DEMO_BOOKING_LOCKED");
      }
      if (!active.some((booking) => booking.id === parsed.data.bookingId)) {
        throw new Error("SPA_DEMO_BOOKING_NOT_FOUND");
      }
      const ordered = active.toSorted((left, right) => left.guestIndex - right.guestIndex);

      if (parsed.data.scope === "GROUP" || active.length === 1) {
        const notification: SpaDemoBookingNotification = {
          kind: "CANCELLED",
          title: "預約已取消",
          date: ordered[0].bookingDate.toISOString().slice(0, 10),
          time: ordered[0].startTime,
          lines: ordered.map((booking, index) => `${index === 0 ? "第 1 位" : `同行者 ${index + 1}`}・${booking.serviceNameSnapshot}・${booking.items.reduce((sum, item) => sum + item.serviceMinutes, 0)} 分鐘`),
          summary: `共 ${ordered.length} 位・整組已取消`,
        };
        await tx.spaBooking.updateMany({
          where: { id: { in: [...SPA_DEMO_LIVE_FLOW_BOOKING_IDS] }, storeId: SPA_DEMO_STORE.id },
          data: { status: "CANCELLED", cancelledAt: new Date() },
        });
        return { cancelledAll: true, bookingIds: [] as string[], notification, notificationBookingId: ordered[0].id };
      }

      const cancelled = ordered.find((booking) => booking.id === parsed.data.bookingId)!;
      const survivors = ordered.filter((booking) => booking.id !== parsed.data.bookingId);
      const partySize = survivors.length;
      for (const [index, survivor] of survivors.entries()) {
        const skills = survivor.notes?.match(/\|skills=([^|]*)/)?.[1] ?? "";
        await tx.spaBooking.update({
          where: { id: survivor.id },
          data: {
            guestIndex: index + 1,
            notes: `SPA_DEMO_LIVE_FLOW|party=${partySize}|guest=${index + 1}|skills=${skills}`,
          },
        });
      }
      await tx.spaBooking.update({
        where: { id: cancelled.id },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
      const notification: SpaDemoBookingNotification = {
        kind: "CANCELLED",
        title: "同行預約已取消",
        date: cancelled.bookingDate.toISOString().slice(0, 10),
        time: cancelled.startTime,
        lines: [`已取消・${cancelled.serviceNameSnapshot}・${cancelled.items.reduce((sum, item) => sum + item.serviceMinutes, 0)} 分鐘`],
        summary: `其餘 ${partySize} 位預約保留`,
      };
      return { cancelledAll: false, bookingIds: survivors.map((booking) => booking.id), notification, notificationBookingId: survivors[0].id };
    });
    const notificationClaim = await prisma.$transaction((tx) =>
      saveSpaDemoBookingNotification(tx, result.notificationBookingId, result.notification),
    );
    await deliverSpaDemoBookingNotificationBestEffort(notificationClaim);
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
