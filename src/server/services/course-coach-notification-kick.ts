import 'server-only';
import { after } from 'next/server';
/** Best-effort fast delivery; durable outbox and cron recover process failures. */
export function kickCoachNotifications(storeId:string) {
 try {after(async()=>{try{const {runCoachNotifications}=await import('./course-coach-notifications');await runCoachNotifications(storeId);}catch(error){console.error('[course-coach] delivery deferred',error instanceof Error?error.message:'unknown');}});}catch{ /* Non-request transactions are picked up by cron. */ }
}
