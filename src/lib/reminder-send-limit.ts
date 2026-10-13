import { getPlanLimits } from "@/lib/feature-flags";
import type { StorePlanFields } from "@/lib/store-plan";

export function checkReminderSendLimit(
  store: StorePlanFields,
  currentMonthSendCount: number
): { allowed: boolean; current: number; limit: number | null } {
  const limits = getPlanLimits(store);
  if (limits.maxReminderSends === null) {
    return { allowed: true, current: currentMonthSendCount, limit: null };
  }
  return {
    allowed: currentMonthSendCount < limits.maxReminderSends,
    current: currentMonthSendCount,
    limit: limits.maxReminderSends,
  };
}
