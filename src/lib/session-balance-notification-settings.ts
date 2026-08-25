export const SESSION_BALANCE_TEMPLATE_VARIABLES = {
  customerName: "顧客姓名",
  planName: "方案名稱",
  bookingDateTime: "最後一堂預約日期與時間",
  bookingUrl: "預約連結",
} as const;

export const DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING = {
  isEnabled: true,
  lastSessionEnabled: true,
  planUsedUpEnabled: true,
  lastSessionUnbookedTemplate:
    "如果最近有想安排放鬆保養，歡迎提前選擇適合的時間。不著急，依照自己的步調安排就可以了。",
  lastSessionBookedTemplate:
    "若您希望之後持續保養，也可以在到店時和我們聊聊下一階段怎麼安排，完全依照您的需求決定就好。",
  planUsedUpTemplate:
    "謝謝您一直以來的支持 😊\n\n舊客續購可享「蒸足 VIP 方案」，享有更優惠的續購選擇。\n\n想了解的話，點擊下方按鈕，我們會立即通知店長，由店長親自為您說明方案內容。",
  learnMoreButtonLabel: "了解蒸足 VIP 方案",
  laterButtonLabel: "之後再看看",
} as const;

export type SessionBalanceNotificationSettingValue = {
  isEnabled: boolean;
  lastSessionEnabled: boolean;
  planUsedUpEnabled: boolean;
  lastSessionUnbookedTemplate: string;
  lastSessionBookedTemplate: string;
  planUsedUpTemplate: string;
  learnMoreButtonLabel: string;
  laterButtonLabel: string;
};

export function extractSessionBalanceCustomCopy(template: string): string {
  return template
    .split(/\n\s*\n/)
    .filter((paragraph) => !/https?:\/\//i.test(paragraph))
    .filter((paragraph) => !/查看可預約時段|目前剩下最後\s*1\s*堂|方案已使用完畢|已安排於\s*\{bookingDateTime\}/.test(paragraph))
    .map((paragraph) => paragraph
      .replace(/\{(?:customerName|planName|bookingDateTime|bookingUrl)\}/g, "")
      .replace(/^[\s，,、：:]+/, "")
      .trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export function renderSessionBalanceTemplate(
  template: string,
  variables: Record<keyof typeof SESSION_BALANCE_TEMPLATE_VARIABLES, string>,
): string {
  return template.replace(
    /\{(customerName|planName|bookingDateTime|bookingUrl)\}/g,
    (_, key: keyof typeof SESSION_BALANCE_TEMPLATE_VARIABLES) => variables[key],
  );
}
