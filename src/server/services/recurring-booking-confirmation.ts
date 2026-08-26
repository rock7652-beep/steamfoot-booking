import { prisma } from "@/lib/db";
import { pushMessage, pushSteamButlerMessage, type LineMessage } from "@/lib/line";
import { getCustomerFacingStoreName } from "@/lib/customer-facing-store-name";
import { resolveCentralLineRecipientForCustomer } from "@/server/services/central-line-recipient-loader";
import { resolveVerifiedReminderLineRoute } from "@/server/services/verified-reminder-line-route";

const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;

/** Best-effort, deduplicated confirmation. Booking creation never rolls back if LINE is unavailable. */
export async function sendRecurringBookingConfirmation(recurrenceGroupId: string): Promise<void> {
  const claimedAt = new Date();
  const staleBefore = new Date(claimedAt.getTime() - PROCESSING_TIMEOUT_MS);
  const claim = await prisma.bookingRecurrenceGroup.updateMany({
    where: {
      id: recurrenceGroupId,
      OR: [
        { confirmationNotificationStatus: { in: ["PENDING", "FAILED"] } },
        { confirmationNotificationStatus: "PROCESSING", confirmationNotificationClaimedAt: { lt: staleBefore } },
      ],
    },
    data: {
      confirmationNotificationStatus: "PROCESSING",
      confirmationNotificationClaimedAt: claimedAt,
      confirmationNotificationError: null,
    },
  });
  if (claim.count !== 1) return;

  try {
    const group = await prisma.bookingRecurrenceGroup.findUnique({
      where: { id: recurrenceGroupId },
      include: {
        customer: { select: { id: true, name: true, lineUserId: true } },
        store: { select: { name: true, slug: true } },
        bookings: {
          select: { bookingDate: true, slotTime: true },
          orderBy: { recurrenceIndex: "asc" },
        },
      },
    });
    if (!group) throw new Error("RECURRING_GROUP_NOT_FOUND");

    const centralRecipient = await resolveCentralLineRecipientForCustomer(group.customerId, group.storeId);
    const route = await resolveVerifiedReminderLineRoute(
      group.storeId,
      group.customer.lineUserId,
      centralRecipient,
    );
    if (route.status === "BLOCKED") throw new Error(`LINE_RECIPIENT_UNAVAILABLE:${route.reason}`);

    const dates = group.bookings.map((booking) =>
      `・${booking.bookingDate.toISOString().slice(0, 10).replaceAll("-", "/")} ${booking.slotTime}`,
    );
    const shopName = getCustomerFacingStoreName({ slug: group.store.slug, name: group.store.name });
    const reservedSessions = group.totalOccurrences * group.people;
    const messages: LineMessage[] = [{
      type: "text",
      text: `${group.customer.name} 您好！\n\n已為您保留每週固定時段：\n${dates.join("\n")}\n\n共 ${group.totalOccurrences} 週、${group.people} 人，預留 ${reservedSessions} 堂方案額度。每次服務完成後才會核銷該次堂數。\n\n${shopName}`,
    }];
    const result = route.channel === "STORE"
      ? await pushMessage(group.storeId, route.recipientLineUserId, messages)
      : await pushSteamButlerMessage(route.recipientLineUserId, messages);
    if (!result.success) throw new Error(result.error ?? "LINE_DELIVERY_FAILED");

    await prisma.bookingRecurrenceGroup.updateMany({
      where: { id: recurrenceGroupId, confirmationNotificationStatus: "PROCESSING", confirmationNotificationClaimedAt: claimedAt },
      data: { confirmationNotificationStatus: "SENT", confirmationNotificationSentAt: new Date() },
    });
  } catch (error) {
    await prisma.bookingRecurrenceGroup.updateMany({
      where: { id: recurrenceGroupId, confirmationNotificationStatus: "PROCESSING", confirmationNotificationClaimedAt: claimedAt },
      data: {
        confirmationNotificationStatus: "FAILED",
        confirmationNotificationError: error instanceof Error ? error.message.slice(0, 500) : "UNKNOWN_ERROR",
      },
    });
  }
}
