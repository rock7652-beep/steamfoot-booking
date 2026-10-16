import { compensationRule } from "./course-compensation";

/** Legacy snapshot calculation: round once after aggregating. Preserve historical fixed fees. */
export function calculateLegacyTeacherFee(rule:unknown, seats:{paid:number;freeTrial:number;pending:number}, prices:{perLesson:number|null;freeTrialBase:number|null}):number|null {
  const parsed=compensationRule.safeParse(rule);
  if(!parsed.success)return null;
  if(parsed.data.mode==="CLASS")return parsed.data.value;
  if(parsed.data.mode!=="SHARE" || seats.pending || prices.perLesson===null || (seats.freeTrial>0 && prices.freeTrialBase===null))return null;
  const amount=(seats.paid*prices.perLesson+seats.freeTrial*(prices.freeTrialBase??0))*parsed.data.value/100;
  return Number.isSafeInteger(Math.round(amount)) ? Math.round(amount) : null;
}
