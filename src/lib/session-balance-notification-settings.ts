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
    "{customerName} 您好，您的「{planName}」目前剩下最後 1 堂囉 🌿\n\n如果最近有想安排放鬆保養，歡迎提前選擇適合的時間。不著急，依照自己的步調安排就可以了。\n\n查看可預約時段：{bookingUrl}",
  lastSessionBookedTemplate:
    "{customerName} 您好，溫馨提醒，您的「{planName}」目前剩下最後 1 堂，已安排於 {bookingDateTime}。\n\n若您希望之後持續保養，也可以在到店時和我們聊聊下一階段怎麼安排，完全依照您的需求決定就好。",
  planUsedUpTemplate:
    "{customerName} 您好，您的「{planName}」方案已使用完畢，謝謝您一直以來的支持 😊\n\n舊客續購可享「蒸足 VIP 方案」，享有更優惠的續購選擇。\n\n想了解的話，點擊下方按鈕，我們會立即通知店長，由店長親自為您說明方案內容。",
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

export function renderSessionBalanceTemplate(
  template: string,
  variables: Record<keyof typeof SESSION_BALANCE_TEMPLATE_VARIABLES, string>,
): string {
  return template.replace(
    /\{(customerName|planName|bookingDateTime|bookingUrl)\}/g,
    (_, key: keyof typeof SESSION_BALANCE_TEMPLATE_VARIABLES) => variables[key],
  );
}
