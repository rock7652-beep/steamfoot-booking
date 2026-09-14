export const MANAGER_NOTIFICATION_OPTIONS = [
  {
    key: "sameDay",
    label: "當日新預約",
    group: "預約通知",
    description: "顧客自行預約今天的服務時通知。",
  },
  {
    key: "trial",
    label: "新體驗預約",
    group: "預約通知",
    description: "公開體驗表單預約成功時通知；當日預約合併成一則。",
  },
  {
    key: "vip",
    label: "VIP 續購需求",
    group: "顧客需求",
    description: "顧客點選了解 VIP 方案時通知。",
  },
  {
    key: "lead",
    label: "數位管家新名單",
    group: "顧客需求",
    description: "顧客留下聯絡資料時通知。",
  },
  {
    key: "support",
    label: "要求真人客服",
    group: "顧客需求",
    description: "要求接手時通知；超過 30 分鐘未接手再提醒一次。",
  },
  {
    key: "payment",
    label: "待確認付款",
    group: "店務提醒",
    description: "方案交易進入待確認付款時通知。",
  },
  {
    key: "incomplete",
    label: "服務未完成",
    group: "店務提醒",
    description: "預約開始兩小時後仍未完成，由排程檢查通知。",
  },
  {
    key: "digest",
    label: "每日待辦摘要",
    group: "店務提醒",
    description: "每天上午 9 點，有待處理事項才通知。",
  },
] as const;
export type ManagerPreferenceKey =
  (typeof MANAGER_NOTIFICATION_OPTIONS)[number]["key"];
export type ManagerPreferences = Record<ManagerPreferenceKey, boolean>;
export function managerPreferences(
  raw: unknown,
  sameDay = false,
): ManagerPreferences {
  const p =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    MANAGER_NOTIFICATION_OPTIONS.map((o) => [
      o.key,
      o.key === "sameDay"
        ? sameDay
        : typeof p[o.key] === "boolean"
          ? p[o.key]
          : o.key !== "incomplete",
    ]),
  ) as ManagerPreferences;
}
export const MANAGER_EVENT_PREFERENCE: Record<string, ManagerPreferenceKey> = {
  SAME_DAY_BOOKING_CREATED: "sameDay",
  PUBLIC_TRIAL_BOOKING_CREATED: "trial",
  VIP_INTEREST: "vip",
  DIGITAL_BUTLER_LEAD_CREATED: "lead",
  HUMAN_SUPPORT_REQUESTED: "support",
  HUMAN_SUPPORT_FINAL_REMINDER: "support",
  TRANSFER_PENDING_CONFIRMATION: "payment",
  INCOMPLETE_SERVICE_REMINDER: "incomplete",
  DAILY_ACTION_DIGEST: "digest",
};
