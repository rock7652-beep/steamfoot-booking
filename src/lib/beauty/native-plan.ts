import {z} from 'zod';
import {savedCoursePlan} from '@/lib/course-plan-save';
import {savedBeautyPlan,beautySessionProduct} from './catalog-adapter';
export const savedBeautyFee=savedCoursePlan.extend({catalogRevision:z.number().int(),catalogSnapshot:savedBeautyPlan});
export function nativeBeautyPlan(input:unknown){const record=savedBeautyPlan.parse(input);return savedBeautyFee.parse({...beautySessionProduct(record),sportsMode:record.serviceIds.length===1?'ASSIGNED':'LEGACY',sportsSubjectId:record.serviceIds[0]??null,sportsCost:1});}
