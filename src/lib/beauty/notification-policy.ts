import { isPreviewExternalIntegrationBlocked } from "@/lib/runtime-env";
import {reviewedBeautyNotificationWorker,beautyNotificationActivationAt} from "../../../scripts/beauty-notification-release-scope.mjs";
export {beautyNotificationActivationAt};

/** Shared by the observer, cron and final transport boundary. No DB work while off. */
export function beautyNotificationDeliveryBlocked() {
  return process.env.BEAUTY_MODULE_ENABLED !== "1" ||
    process.env.BEAUTY_NOTIFICATIONS_ENABLED !== "1" ||
    isPreviewExternalIntegrationBlocked() ||
    process.env.BEAUTY_DATABASE_MODE === "dedicated" && !reviewedBeautyNotificationWorker();
}
