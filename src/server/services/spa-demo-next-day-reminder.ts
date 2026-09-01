import "server-only";

import { prisma } from "@/lib/db";
import { spaPrisma } from "@/lib/spa-db";
import { parseTaiwanDateToDbDate, toLocalDateStr } from "@/lib/date-utils";
import {
  SPA_DEMO_LIVE_FLOW_BOOKING_IDS,
  SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
  SPA_DEMO_STORE,
  type SpaDemoBookingNotification,
} from "@/lib/spa-demo-store";
import {
  deliverSpaDemoBookingNotificationBestEffort,
  saveSpaDemoBookingNotification,
} from "@/server/services/spa-demo-booking-notification";

export async function sendSpaDemoNextDayReminder(now = new Date()) {
  if (process.env.VERCEL_ENV === "production") {
    return { sent: 0, skipped: 1, reason: "PRODUCTION_BLOCKED" };
  }

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowDate = toLocalDateStr(tomorrow);
  const bookings = await spaPrisma.spaBooking.findMany({
    where: {
      id: { in: [...SPA_DEMO_LIVE_FLOW_BOOKING_IDS] },
      storeId: SPA_DEMO_STORE.id,
      customerId: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
      bookingDate: parseTaiwanDateToDbDate(tomorrowDate),
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    select: {
      id: true,
      startTime: true,
      notes: true,
      serviceNameSnapshot: true,
      guestIndex: true,
      items: { select: { serviceMinutes: true } },
    },
  });
  if (!bookings.length) return { sent: 0, skipped: 1, reason: "NO_NEXT_DAY_BOOKING" };
  const ordered = bookings.toSorted((left, right) => left.guestIndex - right.guestIndex);
  const notification: SpaDemoBookingNotification = {
    kind: "REMINDER",
    title: "明日預約提醒",
    date: tomorrowDate,
    time: ordered[0].startTime,
    lines: ordered.map((booking, index) => `${index === 0 ? "第 1 位" : `同行者 ${index + 1}`}・${booking.serviceNameSnapshot}・${booking.items.reduce((sum, item) => sum + item.serviceMinutes, 0)} 分鐘`),
    summary: `共 ${ordered.length} 位・期待明天見`,
  };
  const claim = await prisma.$transaction((tx) =>
    saveSpaDemoBookingNotification(tx, ordered[0].id, notification),
  );
  const delivery = await deliverSpaDemoBookingNotificationBestEffort(claim);
  return {
    sent: delivery === "SENT" ? 1 : 0,
    simulated: delivery === "SIMULATED" ? 1 : 0,
    skipped: delivery === "SENT" || delivery === "SIMULATED" ? 0 : 1,
    reason: delivery === "SENT" || delivery === "SIMULATED" ? null : delivery,
  };
}
