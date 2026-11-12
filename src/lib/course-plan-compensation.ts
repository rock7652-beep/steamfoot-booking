import {z} from 'zod';
/** Only new agreements use these two modes. Historical HOUR snapshots stay valid. */
export const coursePlanCompensation=z.object({mode:z.enum(['SHARE','CLASS']),value:z.number().finite().min(0).max(1000000)}).superRefine((r,c)=>{
 if(r.mode==='SHARE'&&r.value>100)c.addIssue({code:'custom',message:'比例需介於 0–100%'});
 if(r.mode==='CLASS'&&!Number.isInteger(r.value))c.addIssue({code:'custom',message:'固定費用須為整數元'});
 if(Math.abs(r.value*100-Math.round(r.value*100))>0.000001)c.addIssue({code:'custom',message:'最多填兩位小數'});
});
export type CoursePlanCompensation=z.infer<typeof coursePlanCompensation>;
// Namespaced entries live in the existing, revision-checked teacher settings JSON.
// Qualification IDs are never used as plan identities.
export const coursePlanRuleKey=(planId:string)=>`plan:${planId}`;
export const musicSubjectDefaultId=(subjectId:string)=>`subject_schedule_${subjectId}`;
export type TeachingPlanChoice={id:string;name:string;subjectIds:string[];active:boolean;templateIds?:string[];defaults:Record<string,CoursePlanCompensation|null>;legacy?:boolean};
export function compensationLabel(rule:{mode:string;value:number}|null|undefined){return !rule?'尚未設定':rule.mode==='CLASS'?`固定費用 $${rule.value.toLocaleString('zh-TW')}／次`:rule.mode==='HOUR'?`舊約定 $${rule.value.toLocaleString('zh-TW')}／小時`:`比例拆帳 ${rule.value}%`;}
