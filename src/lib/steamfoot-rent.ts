import { z } from "zod";

export const rentMonth = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/, "請選擇有效月份");
export const rentInput = z.object({
  staffId: z.string().min(1),
  startMonth: rentMonth,
  cycleMonths: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]),
  monthlyAmount: z.number().int().min(0).max(10000000),
  enabled: z.boolean(),
  expectedTermId: z.string().nullable(),
});
export type RentTerm = {
  id: string; staffId: string; startMonth: string; endMonth: string | null;
  cycleMonths: number; monthlyAmount: number; enabled: boolean;
};
export function monthIndex(month: string) {
  rentMonth.parse(month);
  const [year, m] = month.split("-").map(Number);
  return year * 12 + m - 1;
}
export function shiftMonth(month: string, offset: number) {
  const index = monthIndex(month) + offset;
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
}
/** Recurring contractual periods only; never creates a receivable/payment record. */
export function rentPeriod(term: RentTerm, month: string) {
  const delta = monthIndex(month) - monthIndex(term.startMonth);
  if (!term.enabled || delta < 0 || (term.endMonth && month > term.endMonth)) return null;
  const startMonth = shiftMonth(term.startMonth, Math.floor(delta / term.cycleMonths) * term.cycleMonths);
  const endMonth = shiftMonth(startMonth, term.cycleMonths - 1);
  return { key: `${term.id}:${startMonth}`, startMonth, endMonth,
    monthlyAmount: term.monthlyAmount, total: term.monthlyAmount * term.cycleMonths };
}
export function nextRentStart(term: RentTerm | undefined, currentMonth: string) {
  if (!term) return currentMonth;
  const delta = Math.max(0, monthIndex(currentMonth) - monthIndex(term.startMonth));
  return shiftMonth(term.startMonth, (Math.floor(delta / term.cycleMonths) + 1) * term.cycleMonths);
}
export function validateRentChange(previous: RentTerm | undefined, input: z.infer<typeof rentInput>, currentMonth: string) {
  if ((previous?.id ?? null) !== input.expectedTermId) return "設定已更新，請重新整理後再試。";
  if (previous) {
    if (input.startMonth < nextRentStart(previous, currentMonth)) return "請從下一個完整租期開始，保留既有租期。";
    if ((monthIndex(input.startMonth) - monthIndex(previous.startMonth)) % previous.cycleMonths !== 0)
      return "新約定須接在原租期結束後。";
  }
  if (input.enabled && input.monthlyAmount <= 0) return "啟用租金時，請填寫大於 0 的每月金額。";
  return null;
}
