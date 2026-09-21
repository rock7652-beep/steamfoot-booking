import {z} from "zod";
export const compensationRule=z.object({mode:z.enum(["CLASS","HOUR","SHARE"]),value:z.number().finite().min(0).max(1000000)}).superRefine((r,c)=>{if(r.mode==="SHARE"&&r.value>100)c.addIssue({code:"custom",message:"拆帳比例需介於 0–100%"});if(Math.abs(r.value*100-Math.round(r.value*100))>0.000001)c.addIssue({code:"custom",message:"最多填兩位小數"});});
export const compensationRules=z.array(compensationRule).max(3).refine(r=>new Set(r.map(v=>v.mode)).size===r.length,"計酬方式不可重複");
export type CompensationRule=z.infer<typeof compensationRule>;
export const COMPENSATION_LABELS={CLASS:"每堂固定",HOUR:"按時長計算",SHARE:"按比例拆帳"};
export const COMPENSATION_UNITS={CLASS:"元／堂",HOUR:"元／小時",SHARE:"%（教練分得）"};
/** Returns the unrounded amount in currency units: callers must not silently round each pupil independently. */
export function compensationAmount(rule:CompensationRule,minutes:number,receipts:{paid:number;totalUnits:number;usedUnits:number}[]) {
 compensationRule.parse(rule);
 if(!Number.isFinite(minutes)||minutes<=0)throw new Error("授課分鐘數不正確");
 if(rule.mode==="CLASS")return rule.value;
 if(rule.mode==="HOUR")return rule.value*minutes/60;
 return receipts.reduce((sum,r)=>{if(!Number.isFinite(r.paid)||r.paid<0||!Number.isFinite(r.totalUnits)||r.totalUnits<=0||!Number.isFinite(r.usedUnits)||r.usedUnits<0||r.usedUnits>r.totalUnits)throw new Error("缺少有效的實收與原始額度");return sum+r.paid*r.usedUnits/r.totalUnits;},0)*rule.value/100;
}
