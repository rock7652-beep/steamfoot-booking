import { formatTWDateTime } from "@/lib/date-utils";

/** Both the picker and transaction compare the exact first-class instant. */
export function courseCardStartIssue(required: boolean, startsAt: Date | string | null | undefined, scheduledAt: Date | string | null | undefined): string | null {
  if (!required || !scheduledAt) return null;
  if (!startsAt || !Number.isFinite(new Date(startsAt).getTime())) return "課卡起始課堂資料不完整，請先核對課卡";
  if (new Date(scheduledAt).getTime() < new Date(startsAt).getTime()) return `尚未到課卡起始時間：${formatTWDateTime(new Date(startsAt))} 起可使用，請調整排課時間或改選其他課卡`;
  return null;
}
