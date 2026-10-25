/** Explicit production-only worker release; preview/local integrations remain blocked. */
export function beautyNotificationRelease(env){
 const value=env.BEAUTY_NOTIFICATIONS_START_AT;
 if(env.BEAUTY_NOTIFICATIONS_ENABLED!=='1'||env.BEAUTY_NOTIFICATION_WORKER_REVIEWED!=='1'||env.VERCEL_ENV!=='production'||env.VERCEL_GIT_COMMIT_REF!=='main'||!value||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)||!Number.isFinite(Date.parse(value)))return false;
 return true;
}
