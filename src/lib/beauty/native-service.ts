import {z} from 'zod';
import {savedBeautyService} from './catalog-adapter';
export const savedBeautySubject=z.object({id:z.string(),name:z.string(),category:z.string(),description:z.string(),isActive:z.boolean(),revision:z.number().int(),catalogSnapshot:savedBeautyService,sportsRule:z.object({pointCost:z.number(),coachIds:z.array(z.string()),expectedCoachIds:z.array(z.string()),compensation:z.object({mode:z.enum(['SHARE','HOUR','CLASS']),value:z.number()}).nullable(),expectedCompensation:z.object({mode:z.enum(['SHARE','HOUR','CLASS']),value:z.number()}).nullable()})});
export function nativeBeautyService(input:unknown,coachIds:string[]){
 const s=savedBeautyService.parse(input);
 const compensation=s.defaultRate?.mode==='PERCENT'?{mode:'SHARE' as const,value:s.defaultRate.value}:s.defaultRate?.mode==='HOURLY'?{mode:'HOUR' as const,value:s.defaultRate.value}:s.defaultRate?.mode==='FIXED'?{mode:'CLASS' as const,value:s.defaultRate.value}:null;
 return savedBeautySubject.parse({id:s.id,name:s.name,category:s.category,description:'',isActive:s.active,revision:s.revision,catalogSnapshot:s,sportsRule:{pointCost:1,coachIds,expectedCoachIds:coachIds,compensation,expectedCompensation:compensation}});
}
