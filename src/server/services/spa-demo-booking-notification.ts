import "server-only";

import type { Prisma } from "@prisma/client";
import {
  SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
  SPA_DEMO_LIVE_FLOW_NOTIFICATION_ID,
  SPA_DEMO_STORE,
  type SpaDemoBookingNotification,
} from "@/lib/spa-demo-store";

export async function saveSpaDemoBookingNotification(
  tx: Prisma.TransactionClient,
  bookingId: string,
  notification: SpaDemoBookingNotification,
) {
  await tx.messageLog.upsert({
    where: { id: SPA_DEMO_LIVE_FLOW_NOTIFICATION_ID },
    create: {
      id: SPA_DEMO_LIVE_FLOW_NOTIFICATION_ID,
      storeId: SPA_DEMO_STORE.id,
      customerId: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
      bookingId,
      channel: "LINE",
      status: "SKIPPED",
      renderedBody: JSON.stringify(notification),
    },
    update: {
      storeId: SPA_DEMO_STORE.id,
      customerId: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
      bookingId,
      channel: "LINE",
      status: "SKIPPED",
      renderedBody: JSON.stringify(notification),
      errorMessage: null,
      sentAt: null,
    },
  });
}
