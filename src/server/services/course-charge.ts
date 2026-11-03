import 'server-only';
import {musicTeachingSubjectId} from '@/lib/music-teaching-item';
import type {Prisma} from '../../../generated/course-client';
import {courseChargeSettings,quoteCourseCharge,type CourseChargeSettings} from '@/lib/course-charge-settings';
import {AppError} from '@/lib/errors';
/** Validate existing qualifications without mutating another fee's teachers. */
export async function assertChargeProviders(tx:Prisma.TransactionClient,storeId:string,templateIds:string[],settings:CourseChargeSettings){
 const templates=await tx.courseTemplate.findMany({where:{storeId,id:{in:templateIds}},select:{id:true,musicSubjectId:true}});
 const subjects=templates.flatMap(t=>t.musicSubjectId?[t.musicSubjectId]:[]);
 const related=subjects.length?await tx.courseTemplate.findMany({where:{storeId,musicSubjectId:{in:subjects},isActive:true},select:{id:true}}):templates;
 const ids=related.map(t=>t.id);
 const providers=await tx.$queryRaw<{id:string;qualificationIds:string[]}[]>`SELECT id,"courseQualifiedTemplateIds" AS "qualificationIds" FROM "Staff" WHERE "storeId"=${storeId} AND status::text='ACTIVE' AND "courseCoachEnabled"=true AND "courseQualificationsConfirmed"=true AND id=ANY(${settings.providerIds}::text[])`;
 if(providers.length!==settings.providerIds.length||ids.length&&providers.some(p=>!p.qualificationIds.some(id=>ids.includes(id))))throw new AppError('VALIDATION','請勾選本店啟用且具教學項目資格的授課人員');
}
export async function resolveScheduleCharge(tx:Prisma.TransactionClient,storeId:string,input:{chargePlanId?:string;templateId:string;coachId:string;isTrial:boolean;open:boolean;defaultTrialPrice:number;durationMinutes:number;sports?:boolean;requireSelection?:boolean}){
 if(!input.chargePlanId){
  if(input.requireSelection){
   const subjectId=musicTeachingSubjectId(input.templateId)??(await tx.courseTemplate.findFirst({where:{storeId,id:input.templateId},select:{musicSubjectId:true}}))?.musicSubjectId;
   const related=subjectId?await tx.courseTemplate.findMany({where:{storeId,musicSubjectId:subjectId},select:{id:true}}):[{id:input.templateId}];
   const plans=await tx.coursePointPlan.findMany({where:{storeId,isActive:true,...(input.sports?{sportsMode:input.open?'OPEN':{not:'OPEN'}}:{}),OR:[{templateIds:{hasSome:related.map(t=>t.id)}},{sportsMode:'OPEN'}]},select:{chargeSettings:true}});
   if(plans.some(p=>courseChargeSettings.safeParse(p.chargeSettings).success))throw new AppError('VALIDATION','請選擇本次收費方式');
  }
  return null;
 }
 const plan=await tx.coursePointPlan.findFirst({where:{storeId,id:input.chargePlanId,isActive:true}});
 if(!plan)throw new AppError('VALIDATION','收費方式已停用或不屬於本店');
 if(input.sports&&input.open!==(plan.sportsMode==='OPEN'))throw new AppError('VALIDATION','請選擇符合指定項目或開放選課的收費方式');
 const settings=courseChargeSettings.parse(plan.chargeSettings);
 const virtualSubject=musicTeachingSubjectId(input.templateId);
 const template=virtualSubject?{id:input.templateId,musicSubjectId:virtualSubject}:await tx.courseTemplate.findFirst({where:{storeId,id:input.templateId},select:{id:true,musicSubjectId:true}});
 const allowed=await tx.courseTemplate.findMany({where:{storeId,id:{in:plan.templateIds}},select:{id:true,musicSubjectId:true}});
 if(plan.sportsMode!=='OPEN'&&(!template||!allowed.some(t=>t.id===template.id||t.musicSubjectId&&t.musicSubjectId===template.musicSubjectId)))throw new AppError('VALIDATION','此收費方式不適用所選教學項目');
 if(!settings.providerIds.includes(input.coachId))throw new AppError('VALIDATION','此收費方式未開放所選授課人員');
 await assertChargeProviders(tx,storeId,virtualSubject?allowed.map(t=>t.id):[input.templateId],{...settings,providerIds:[input.coachId]});
 const quote=quoteCourseCharge(settings,input.isTrial,input.open,input.defaultTrialPrice);
 return {snapshot:{planId:plan.id,name:plan.name,price:plan.price,storeCost:plan.storeCost,settings,trialPrice:input.open?input.defaultTrialPrice:input.isTrial?quote.trialPrice:settings.kind==='single'?settings.trialPrice:null,isTrial:input.isTrial},...quote,duration:input.open||settings.kind==='plan'?input.durationMinutes:quote.duration};
}
