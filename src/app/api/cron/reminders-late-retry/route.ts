/**
 * Late safety-net cron (UTC 13:00 = Taiwan 21:00).
 *
 * Reuses the existing retry gate and reminder-engine idempotency. If either
 * the 18:00 primary run or 18:30 retry completed, this is a no-op. Otherwise
 * it safely recovers the missed batch after deployment windows have cleared.
 */
export { dynamic, GET } from "../reminders-retry/route";
