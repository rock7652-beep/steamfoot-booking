import { z } from "zod";
import { compensationRule, type CompensationRule } from "./course-compensation";
export const musicTeacherSettings = z.object({
  defaultRatio:z.number().finite().min(0).max(1).multipleOf(0.0001).nullable(),
  subjectRules:z.record(z.string().min(1).max(180),compensationRule.refine(r=>r.mode!=="HOUR")).refine(r=>Object.keys(r).length<=500),
  revision:z.number().int().nonnegative(),
});
export type MusicTeacherSettings=z.infer<typeof musicTeacherSettings>;
export function resolveMusicTeacherRule(override:CompensationRule|null,subjectId:string|null|undefined,settings:MusicTeacherSettings,productRatio:number|null|undefined) {
  if(override)return {rule:override,source:"方案個別設定"};
  if(subjectId && settings.subjectRules[subjectId])return {rule:settings.subjectRules[subjectId],source:"沿用科目設定"};
  if(settings.defaultRatio!==null)return {rule:{mode:"SHARE" as const,value:settings.defaultRatio*100},source:`沿用老師 ${settings.defaultRatio}`};
  return productRatio==null?{rule:null,source:"尚未設定"}:{rule:{mode:"SHARE" as const,value:productRatio*100},source:`沿用方案 ${productRatio}`};
}
