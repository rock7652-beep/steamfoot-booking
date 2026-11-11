export type PlanUsageDate = { id: string; date: string; customerName?: string; courseName?: string };
export type PlanUsageProgress = { available: false; reason: string } | { available: true; total: number; completed: PlanUsageDate[]; voided: PlanUsageDate[] };
export const unavailablePlanProgress = (): PlanUsageProgress => ({ available: false, reason: '使用日期與方案餘額待核對，請查看完整紀錄。' });

/** Presentation validation only. Never infer missing dates from the current date. */
export function checkedPlanProgress(total: number, remaining: number, completed: PlanUsageDate[], voided: PlanUsageDate[]): PlanUsageProgress {
  if (!Number.isSafeInteger(total) || total < 1 || total > 2000 || !Number.isSafeInteger(remaining) || remaining < 0 || remaining > total || completed.length + voided.length !== total - remaining || [...completed, ...voided].some(row => !Number.isFinite(Date.parse(row.date)))) return unavailablePlanProgress();
  return { available: true, total, completed, voided };
}
