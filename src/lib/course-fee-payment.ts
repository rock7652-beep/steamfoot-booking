import { z } from "zod";
import { compensationRule } from "./course-compensation";

export const courseFeePaymentInput = z.object({
  sessionId: z.string().min(1).max(180),
  requestKey: z.string().uuid(),
  expectedAmount: z.number().int().positive().max(1000000),
  method: z.enum(["CASH", "OTHER"]),
  note: z.string().trim().min(1, "請填寫付款備註").max(500),
});

export const courseFeeVoidInput = z.object({paymentId:z.string().uuid(),reason:z.string().trim().min(1,"請填寫更正原因").max(500)});

/** Missing and legacy snapshots require review; they never silently become zero. */
export function fixedCourseFee(rule: unknown): number | null {
  const parsed = compensationRule.safeParse(rule);
  return parsed.success && parsed.data.mode === "CLASS" ? parsed.data.value : null;
}

export function courseTeacherFee(rule:unknown, seats:{paid:number;freeTrial:number;pending:number}, prices:{perLesson:number|null;freeTrialBase:number|null}):number|null {
  const parsed=compensationRule.safeParse(rule);
  if(!parsed.success)return null;
  if(parsed.data.mode==="CLASS")return parsed.data.value;
  if(parsed.data.mode!=="SHARE" || seats.pending || prices.perLesson===null || (seats.freeTrial>0 && prices.freeTrialBase===null))return null;
  const amount=(seats.paid*prices.perLesson+seats.freeTrial*(prices.freeTrialBase??0))*parsed.data.value/100;
  return Number.isSafeInteger(Math.round(amount)) ? Math.round(amount) : null;
}
