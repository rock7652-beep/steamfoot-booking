import { PACKAGE_LINE_CARD_REMINDER_TEMPLATE_NAME } from "@/lib/package-line-card-reminder-setting";

export const TRIAL_LINE_CARD_REMINDER_TEMPLATE_NAME =
  "__SYSTEM_TRIAL_LINE_CARD_REMINDER__";

export const DEFAULT_TRIAL_LINE_CARD_REMINDER =
  "請提前 5–10 分鐘抵達，如需調整時間請點選下方按鈕。";

export const TRIAL_LINE_CARD_REMINDER_MAX_LENGTH = 150;
export const TRIAL_LINE_CARD_MAP_URL_MAX_LENGTH = 500;

export function trialLineCardReminderSettingId(storeId: string): string {
  return `trial-line-card-reminder:${storeId}`;
}

export function isSystemLineCardReminderTemplate(name: string): boolean {
  return name === TRIAL_LINE_CARD_REMINDER_TEMPLATE_NAME ||
    name === PACKAGE_LINE_CARD_REMINDER_TEMPLATE_NAME;
}
