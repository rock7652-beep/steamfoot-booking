import "server-only";

import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { pushMessage, pushSteamButlerMessage } from "@/lib/line";
import { formatTWDateTime } from "@/lib/date-utils";
import { resolveCentralLineRecipientForCustomer } from "@/server/services/central-line-recipient-loader";
import { resolveVerifiedReminderLineRoute } from "@/server/services/verified-reminder-line-route";
import type { PromotedWaitlistBooking } from "@/server/services/course-waitlist";

export async function notifyCourseWaitlistPromotions(
  storeId: string,
  promoted: PromotedWaitlistBooking[],
) {
  if (!promoted.length) return;

  try {
    const [store, sessions, customers] = await Promise.all([
      prisma.store.findUnique({
        where: { id: storeId },
        select: { name: true },
      }),
      coursePrisma.courseSession.findMany({
        where: { storeId, id: { in: [...new Set(promoted.map(item => item.sessionId))] } },
        select: { id: true, nameSnapshot: true, startsAt: true },
      }),
      prisma.customer.findMany({
        where: { storeId, id: { in: [...new Set(promoted.map(item => item.customerId))] } },
        select: { id: true, name: true, lineUserId: true, lineLinkStatus: true },
      }),
    ]);

    const sessionMap = new Map(sessions.map(item => [item.id, item]));
    const customerMap = new Map(customers.map(item => [item.id, item]));

    for (const item of promoted) {
      const session = sessionMap.get(item.sessionId);
      const customer = customerMap.get(item.customerId);
      if (!session || !customer) continue;

      const central = await resolveCentralLineRecipientForCustomer(customer.id, storeId);
      const route = await resolveVerifiedReminderLineRoute(
        storeId,
        customer.lineLinkStatus === "LINKED" ? customer.lineUserId : null,
        central,
        customer.id,
      );
      if (route.status !== "READY") continue;

      const messages = [{
        type: "text" as const,
        text: [
          "候補已成功遞補",
          store?.name ?? "課程門市",
          `${formatTWDateTime(session.startsAt)} ${session.nameSnapshot}`,
          `上課者：${customer.name}`,
          "名額已為您保留，請依原預約方式準時到店。",
        ].join("\n"),
      }];
      const retryKey = crypto.randomUUID();
      const result = route.channel === "STORE"
        ? await pushMessage(storeId, route.recipientLineUserId, messages, retryKey)
        : await pushSteamButlerMessage(route.recipientLineUserId, messages, retryKey);
      if (!result.success) {
        console.error("[course-waitlist] promotion LINE failed", {
          storeId,
          customerId: customer.id,
          bookingId: item.bookingId,
          error: result.error,
        });
      }
    }
  } catch (error) {
    console.error("[course-waitlist] promotion notification failed", {
      storeId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
