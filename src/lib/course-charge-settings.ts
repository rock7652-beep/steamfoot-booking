import {z} from 'zod';
/** Null settings preserve existing plans. Only explicit single charges offer per-charge trials. */
export const courseChargeSettings=z.object({
 kind:z.enum(['single','plan']),
 durationMinutes:z.number().int().min(5).max(480),
 trialPrice:z.number().int().min(0).max(1000000).nullable(),
 trialStoreCost:z.number().int().min(0).max(10000000).nullable().optional(),
 trialDuration:z.number().int().min(5).max(480).nullable(),
 providerIds:z.array(z.string().min(1).max(100)).min(1).max(200).refine(ids=>new Set(ids).size===ids.length,'授課人員不可重複'),
}).strict().refine(s=>s.kind==='single'||s.trialPrice===null&&s.trialDuration===null&&s.trialStoreCost==null,'多次方案不設定體驗收費').refine(s=>s.trialStoreCost==null||s.trialPrice!==null,'請先設定體驗價');
export type CourseChargeSettings=z.infer<typeof courseChargeSettings>;
export const courseChargeSnapshot=z.object({planId:z.string(),name:z.string(),price:z.number().int().nonnegative(),settings:courseChargeSettings,storeCost:z.number().int().nonnegative().optional(),trialPrice:z.number().int().nonnegative().nullable(),isTrial:z.boolean()});
export type CourseChargeSnapshot=z.infer<typeof courseChargeSnapshot>;
export function quoteCourseCharge(settings:CourseChargeSettings,trial:boolean,open:boolean,defaultTrialPrice:number){
 if(!trial)return {duration:settings.durationMinutes,trialPrice:null};
 if(open)return {duration:settings.durationMinutes,trialPrice:defaultTrialPrice};
 if(settings.kind!=='single'||settings.trialPrice===null)throw Error('此收費方式未開放體驗');
 return {duration:settings.trialDuration??settings.durationMinutes,trialPrice:settings.trialPrice};
}
