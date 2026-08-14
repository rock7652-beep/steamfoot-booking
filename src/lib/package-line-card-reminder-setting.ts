export const PACKAGE_LINE_CARD_REMINDER_TEMPLATE_NAME =
  "__SYSTEM_PACKAGE_LINE_CARD_REMINDER__";

export const DEFAULT_PACKAGE_LINE_CARD_REMINDER = "請記得準時到店。";

export const PACKAGE_LINE_CARD_REMINDER_MAX_LENGTH = 150;

export function packageLineCardReminderSettingId(storeId: string): string {
  return `package-line-card-reminder:${storeId}`;
}
