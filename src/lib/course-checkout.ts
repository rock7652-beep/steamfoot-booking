import { z } from "zod";
export const courseCheckoutSchema = z.object({
  discountKind: z.enum(["AMOUNT", "PERCENT"]),
  discountValue: z.number().finite().min(0).max(10000000).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 0.000001, "最多兩位小數"),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]),
  transferLastFour: z.string().trim().max(4).default(""),
  expectedListPrice: z.number().int().min(0).max(10000000),
});
export type CourseCheckoutInput = z.infer<typeof courseCheckoutSchema>;
export const COURSE_PAYMENT_LABELS: Record<string,string> = {CASH:"現金",BANK_TRANSFER:"轉帳",CARD:"信用卡",OTHER:"其他",DISCOUNT:"全額折抵"};
/** Percentage means the amount deducted, not the percentage payable. Round once to whole NT dollars. */
export function calculateCourseCheckout(listPrice:number,kind:"AMOUNT"|"PERCENT",value:number) {
  if (!Number.isSafeInteger(listPrice) || listPrice < 0 || !Number.isFinite(value) || value < 0 || (kind === "PERCENT" ? value > 100 : !Number.isSafeInteger(value) || value > listPrice)) throw new Error("折抵金額不得超過售價；折抵比例須介於 0–100%");
  const discount = kind === "PERCENT" ? Math.round(listPrice * value / 100) : value;
  return {listPrice, discount, paid:listPrice-discount};
}
