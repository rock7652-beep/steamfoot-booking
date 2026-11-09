import { z } from "zod";
export const adjustmentMonth = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
export const adjustmentInput = z.object({
  id: z.string().uuid(), expectedStoreId: z.string().min(1),
  revision: z.number().int().nonnegative(), staffId: z.string().min(1),
  month: adjustmentMonth,
  date: z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).refine(s => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "請輸入有效日期"),
  direction: z.enum(["ADD", "SUBTRACT"]),
  amount: z.number().int().positive().max(10000000),
  reason: z.string().trim().min(1, "請填寫調整事由").max(500),
});
export type MonthlyAdjustment = Omit<z.infer<typeof adjustmentInput>, "expectedStoreId">;
export type MonthlyAdjustmentSnapshot = {
  storeId:string; month:string; rows:MonthlyAdjustment[]; locked:boolean; revision:number;
};
export function adjustmentTotals(rows: Pick<MonthlyAdjustment,"direction"|"amount">[]) {
  const addition = rows.filter(r => r.direction === "ADD").reduce((sum,r) => sum + r.amount, 0);
  const deduction = rows.filter(r => r.direction === "SUBTRACT").reduce((sum,r) => sum + r.amount, 0);
  return { addition, deduction, net: addition - deduction };
}
