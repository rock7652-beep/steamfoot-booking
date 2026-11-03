import "server-only";
import { after } from "next/server";
export function kickPlanActivationNotifications(storeId: string, beauty = false) {
  try { after(async () => {
    try { const {runPlanActivationNotifications} = await import("./plan-activation-notifications"); await runPlanActivationNotifications(storeId, beauty); }
    catch { console.error("[plan-activation] delivery deferred to cron"); }
  }); } catch { /* Cron recovers committed events outside requests. */ }
}
