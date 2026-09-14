import { prisma } from "@/lib/db";
import { toLocalDateStr } from "@/lib/date-utils";
import { deriveBaseUrl } from "@/lib/base-url";
import { deliverManagerNotification } from "./manager-notification-delivery";

/** Called only after a newly created customer booking commits, never on replay or staff entry. */
export async function notifySameDayBookingManagers(storeId: string, bookingId: string): Promise<void> {
  try {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, storeId },
      select: {
        bookingDate: true, createdAt: true, slotTime: true, people: true,
        bookingStatus: true,
        customer: { select: { name: true } },
        store: { select: { slug: true, name: true, industryModule: true } },
      },
    });
    if (!booking || booking.store.industryModule === "SPA") return;
    const bookingDate = booking.bookingDate.toISOString().slice(0, 10);
    if (bookingDate !== toLocalDateStr() || bookingDate !== toLocalDateStr(booking.createdAt)) return;
    if (!["PENDING", "CONFIRMED"].includes(booking.bookingStatus)) return;
    const url = `${deriveBaseUrl()}/s/${encodeURIComponent(booking.store.slug)}/admin/dashboard/bookings?bookingId=${encodeURIComponent(bookingId)}`;
    await deliverManagerNotification({ storeId, eventKey: `booking-created:${bookingId}`, type: "SAME_DAY_BOOKING_CREATED", messages: [{
      type: "text", text: ["🔔 今日新增預約", "", booking.store.name,
        `顧客：${booking.customer.name}`, `日期：${bookingDate}`, `時間：${booking.slotTime}`, `人數：${booking.people} 位`, "", `查看預約：${url}`].join("\n"),
    }] });
  } catch (error) {
    console.error("[SameDayBookingReminder] failed", { storeId, bookingId, error });
  }
}
