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
    "{customerName} 您好，謝謝您完成這一期的「{planName}」蒸足保養 🤎\n\n如果覺得這段時間對身體有幫助，歡迎再依照自己的狀態，安排下一階段的保養頻率。\n\n還不確定也沒關係，我們可以先陪您了解目前的需求，再決定是否繼續。",
  learnMoreButtonLabel: "了解適合我的方案",
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
