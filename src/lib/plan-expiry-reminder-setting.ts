export const PLAN_EXPIRY_REMINDER_TEMPLATE_NAME =
  "__SYSTEM_PLAN_EXPIRY_REMINDER_ENABLED__";

export function planExpiryReminderSettingId(storeId: string): string {
  return `plan-expiry-reminder-enabled:${storeId}`;
}

export function parsePlanExpiryReminderEnabled(body: string | null | undefined): boolean {
  return body !== "disabled";
}
