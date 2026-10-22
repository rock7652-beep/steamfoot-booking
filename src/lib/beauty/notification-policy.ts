import { isPreviewExternalIntegrationBlocked } from "@/lib/runtime-env";

/** Shared by the observer, cron and final transport boundary. No DB work while off. */
export function beautyNotificationDeliveryBlocked() {
  return process.env.BEAUTY_MODULE_ENABLED !== "1" ||
    process.env.BEAUTY_NOTIFICATIONS_ENABLED !== "1" ||
    isPreviewExternalIntegrationBlocked();
}
