'use server';
import {z} from 'zod';
import {courseManager} from '@/server/services/course-access';
import {coursePrisma} from '@/lib/course-db';
import {getTrialSettings} from '@/lib/shop-config';
import {courseChargeSettings} from '@/lib/course-charge-settings';
import {musicTeachingSubjectId} from '@/lib/music-teaching-item';
import {handleActionError} from '@/lib/errors';
export async function loadCourseChargeOptions(templateId:string){try{
 z.string().min(1).max(100).parse(templateId);
 const {storeId}=await courseManager('booking.create');
 const subject=musicTeachingSubjectId(templateId)??(await coursePrisma.courseTemplate.findFirst({where:{storeId,id:templateId},select:{musicSubjectId:true}}))?.musicSubjectId;
 const related=subject?await coursePrisma.courseTemplate.findMany({where:{storeId,musicSubjectId:subject},select:{id:true}}):[{id:templateId}];
 const plans=await coursePrisma.coursePointPlan.findMany({where:{storeId,isActive:true,OR:[{templateIds:{hasSome:related.map(t=>t.id)}},{sportsMode:'OPEN'}]},orderBy:{name:'asc'}});
 const settings=await getTrialSettings(storeId);
 return {success:true as const,enabled:settings.trialEnabled,defaultTrialPrice:settings.trialDefaultPrice,rows:plans.flatMap(plan=>{const parsed=courseChargeSettings.safeParse(plan.chargeSettings);return parsed.success?[{id:plan.id,name:plan.name,price:plan.price,open:plan.sportsMode==='OPEN',settings:parsed.data}]:[];})};
}catch(error){const failure=handleActionError(error);return {success:false as const,error:failure.success?'收費方式讀取失敗':failure.error};}}
