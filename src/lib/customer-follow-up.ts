import { toLocalDateStr } from "@/lib/date-utils";
import type { CustomerFollowUpResult } from "@prisma/client";

export const CUSTOMER_FOLLOW_UP_RESULT_LABEL: Record<CustomerFollowUpResult, string> = {
  CONTACTED: "已聯絡",
  NO_ANSWER: "未接電話",
  BOOKED: "已預約",
  OTHER: "其他",
};

export const CUSTOMER_FOLLOW_UP_RESULT_OPTIONS: Array<{
  value: CustomerFollowUpResult;
  label: string;
}> = [
  { value: "CONTACTED", label: CUSTOMER_FOLLOW_UP_RESULT_LABEL.CONTACTED },
  { value: "NO_ANSWER", label: CUSTOMER_FOLLOW_UP_RESULT_LABEL.NO_ANSWER },
  { value: "BOOKED", label: CUSTOMER_FOLLOW_UP_RESULT_LABEL.BOOKED },
  { value: "OTHER", label: CUSTOMER_FOLLOW_UP_RESULT_LABEL.OTHER },
];

export function formatRelativeDaysTW(date: Date, now: Date = new Date()): string {
  const from = toLocalDateStr(date);
  const to = toLocalDateStr(now);
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const diffDays = Math.max(
    0,
    Math.round(
      (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000,
    ),
  );

  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "昨天";
  return `${diffDays}天前`;
}
