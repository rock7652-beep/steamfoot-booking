import {addTaiwanDuration,parseTaipeiDateTime,toLocalDateStr} from "@/lib/date-utils";
import {z} from "zod";
import {courseExpiryPlanSchema} from "@/lib/course-plan-reminders";
import {trialCareRulesSchema} from "@/lib/trial-care";

export const beautyPlanReminderSchema = z.object({
  planId:z.string().min(1),expectedStoreId:z.string().min(1),expectedRevision:z.number().int().nonnegative(),
  enabled:z.boolean(),threshold:z.number().int().min(0).max(10000).nullable(),expiry:courseExpiryPlanSchema,
}).refine(v=>!v.enabled || v.threshold!==null,{message:"請填寫剩餘次數門檻",path:["threshold"]});
export function readBeautyExpiry(value:unknown) {
  const result=courseExpiryPlanSchema.safeParse(value);
  return result.success?result.data:{enabled:false,days:[14,7]};
}
export const beautyTrialCareSchema=z.object({storeId:z.string().min(1),expectedRevision:z.string().nullable(),enabled:z.boolean(),rules:trialCareRulesSchema});
export const beautyPlanPreferenceId=(storeId:string,customerId:string)=>`beauty-plan-preference:${encodeURIComponent(storeId)}:${encodeURIComponent(customerId)}`;
/** Invalid preference data fails closed. Only the member can resume. */
export function beautyPlanStopped(body?:string|null) {return body!=null && body!=="receiving";}

export function beautyPlanReminderKinds(card:{remaining:number;expiresAt:Date;closedAt:Date|null},held:number,plan:{active:boolean;lowBalanceEnabled:boolean;lowBalanceThreshold:number|null;expiryReminder:unknown},now:Date) {
  if(!plan.active||card.closedAt||card.expiresAt<=now)return [] as string[];
  const kinds:string[]=[];
  if(plan.lowBalanceEnabled&&plan.lowBalanceThreshold!==null&&card.remaining-held<=plan.lowBalanceThreshold)kinds.push(card.remaining===0?"PLAN_USED_UP":"LOW_BALANCE");
  const expiry=readBeautyExpiry(plan.expiryReminder);
  if(expiry.enabled&&card.remaining>held&&now>=parseTaipeiDateTime(toLocalDateStr(now),"18:00")!) {
    for(const days of expiry.days)if(addTaiwanDuration(toLocalDateStr(now),days,"DAY")===toLocalDateStr(card.expiresAt))kinds.push(`PLAN_EXPIRY:${days}`);
  }
  return kinds;
}
