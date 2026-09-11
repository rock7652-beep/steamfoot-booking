export const PACKAGE_REMINDER_ENABLED_TEMPLATE_NAME =
  "__SYSTEM_PACKAGE_REMINDER_ENABLED__";
export const TRIAL_REMINDER_ENABLED_TEMPLATE_NAME =
  "__SYSTEM_TRIAL_REMINDER_ENABLED__";

export function bookingReminderTypeSettingId(
  storeId: string,
  type: "PACKAGE" | "TRIAL",
): string {
  return `booking-reminder-enabled:${type.toLowerCase()}:${storeId}`;
}

export function bookingReminderTypeSettingName(type: "PACKAGE" | "TRIAL"): string {
  return type === "PACKAGE"
    ? PACKAGE_REMINDER_ENABLED_TEMPLATE_NAME
    : TRIAL_REMINDER_ENABLED_TEMPLATE_NAME;
}

export function parseBookingReminderTypeEnabled(body: string | null | undefined): boolean {
  return body !== "disabled";
}
