import { isPreviewExternalIntegrationBlocked } from "@/lib/runtime-env";

/** Shared by the observer, cron and final transport boundary. No DB work while off. */
export function beautyNotificationDeliveryBlocked() {
  return process.env.BEAUTY_MODULE_ENABLED !== "1" ||
    process.env.BEAUTY_NOTIFICATIONS_ENABLED !== "1" ||
    isPreviewExternalIntegrationBlocked();
}

/** When a reviewed production worker is activated, pre-activation events are never backfilled. */
export function beautyNotificationActivationAt(){
 const value=process.env.BEAUTY_NOTIFICATIONS_START_AT;
 if(!value)return null;
 const date=new Date(value);
 return Number.isFinite(+date)?date:null;
}
