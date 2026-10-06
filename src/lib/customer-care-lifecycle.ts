export const CARE_REASONS = ["birthday", "trial", "inactive", "low", "expiring"] as const;
export type CareReason = typeof CARE_REASONS[number];
export const CARE_REASON_LABELS: Record<CareReason, string> = {
  birthday: "生日祝福", trial: "體驗關懷", inactive: "回店關懷", low: "額度關懷", expiring: "到期關懷",
};
export type CareActivity = {
  id: string;
  reason: CareReason;
  year: number | null;
  result: string;
  note: string | null;
  date: string;
  createdAt?: string;
  by: string;
  nextDate: string | null;
};
export type CareDisposition = { state: "pending" | "handled"; label: string };
/** Only the matching reason may defer a reminder. Legacy contacts never dismiss it. */
export function careDisposition(reason: CareReason, year: number, today: string, activity?: CareActivity | null, nextBooking?: string | null): CareDisposition {
  if (reason === "birthday") {
    return activity?.reason === reason && activity.year === year && activity.result === "CONTACTED"
      ? { state: "handled", label: "已祝福" } : { state: "pending", label: "待祝福" };
  }
  if (reason === "inactive" && nextBooking) return { state: "handled", label: "已預約" };
  if (activity?.reason === reason && activity.nextDate && activity.nextDate > today)
    return { state: "handled", label: `${activity.nextDate} 再追蹤` };
  return { state: "pending", label: activity?.reason === reason && activity.nextDate ? "追蹤到期" : "待關懷" };
}
