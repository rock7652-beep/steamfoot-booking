import "server-only";
import type {Prisma} from "../../../generated/course-client";
import {AppError} from "@/lib/errors";
import {musicTeachingSubjectId} from "@/lib/music-teaching-item";

type Reader=Pick<Prisma.TransactionClient,"courseTemplate"|"musicSubject">;
/** Reads may preview an item without creating anything; writes resolve it under the store lock. */
export async function readMusicTeachingItem(tx:Reader,storeId:string,key:string) {
  const subjectId=musicTeachingSubjectId(key);
  if(!subjectId)return tx.courseTemplate.findFirst({where:{id:key,storeId},include:{musicSubject:true}});
  const subject=await tx.musicSubject.findFirst({where:{id:subjectId,storeId,isActive:true}});
  if(!subject)throw new AppError("VALIDATION","請選擇本店啟用的教學項目");
  const defaults=await tx.courseTemplate.findFirst({where:{storeId,musicSubjectId:subjectId,isActive:true},orderBy:[{createdAt:"asc"},{id:"asc"}],select:{durationMinutes:true,visibility:true,description:true,precautions:true}});
  return {id:key,storeId,name:subject.name,musicSubjectId:subject.id,musicSubject:subject,isActive:true,visibility:defaults?.visibility??"PUBLIC",classType:null,musicTrialMode:null,musicPricePerLesson:null,musicTermLessons:null,musicScheduleMode:null,durationMinutes:defaults?.durationMinutes??60,pointCost:1,capacity:500,defaultRoomId:null};
}
export async function ensureMusicTeachingItem(tx:Prisma.TransactionClient,storeId:string,key:string,trialDefaultPrice=0) {
  if(!musicTeachingSubjectId(key))return;
  const item=await readMusicTeachingItem(tx,storeId,key);
  if(!item)throw new AppError("VALIDATION","找不到教學項目");
  const existing=await tx.courseTemplate.findFirst({where:{id:key,storeId}});
  const trial=key.startsWith("teaching-trial:")?await readTeachingTrialPrice(tx,storeId,key):null;
  const trialFields=key.startsWith("teaching-trial:")?{musicTrialMode:trial?.musicTrialMode??"PAID",musicPricePerLesson:trial?.musicTrialMode==="FREE"?0:trial?.musicPricePerLesson??trialDefaultPrice,musicTeacherFeeBase:trial?.musicTeacherFeeBase??null}:{};
  if(existing&&existing.musicSubjectId!==item.musicSubjectId)throw new AppError("CONFLICT","教學項目資料不一致，請重新確認設定");
  if(existing){if(key.startsWith("teaching-trial:"))await tx.courseTemplate.update({where:{id:key},data:trialFields});return;}
  const products=await tx.courseTemplate.findMany({where:{storeId,musicSubjectId:item.musicSubjectId,id:{not:{startsWith:"teaching"}}},select:{musicTeacherShare:true}});
  const shares=[...new Set(products.flatMap(product=>product.musicTeacherShare==null?[]:[product.musicTeacherShare]))];
  await tx.courseTemplate.create({data:{id:key,storeId,name:`教學項目：${item.name}`,musicSubjectId:item.musicSubjectId,category:item.musicSubject?.category??"",musicTeacherShare:shares.length===1?shares[0]:null,...trialFields,durationMinutes:item.durationMinutes,visibility:item.visibility,pointCost:1,capacity:500}});

}
export async function musicTeachingQualifications(tx:Pick<Prisma.TransactionClient,"courseTemplate">,storeId:string,template:{id:string;musicSubjectId?:string|null}) {
  if(!template.musicSubjectId)return [template.id];
  const related=await tx.courseTemplate.findMany({where:{storeId,musicSubjectId:template.musicSubjectId},select:{id:true}});
  return [...new Set([template.id,...related.map(row=>row.id),`teaching:${template.musicSubjectId}`])];
}
/** Regular tuition versions remain separate, but can cover the same teaching item. */
export async function cardCoversTeachingItem(tx:Pick<Prisma.TransactionClient,"courseTemplate">,storeId:string,templateId:string,cardTemplateIds:string[]) {
  if(!cardTemplateIds.length||cardTemplateIds.includes(templateId))return true;
  const subjectId=musicTeachingSubjectId(templateId)??(await tx.courseTemplate.findFirst({where:{id:templateId,storeId},select:{musicSubjectId:true}}))?.musicSubjectId;
  if(!subjectId)return false;
  return !!await tx.courseTemplate.findFirst({where:{storeId,id:{in:cardTemplateIds},musicSubjectId:subjectId,musicTrialMode:templateId.startsWith("teaching-trial:")?{in:["FREE","PAID"]}:null},select:{id:true}});
}
export async function readTeachingTrialPrice(tx:Pick<Prisma.TransactionClient,"courseTemplate">,storeId:string,key:string) {
  const subjectId=musicTeachingSubjectId(key);
  if(!subjectId)return tx.courseTemplate.findFirst({where:{id:key,storeId},select:{musicTrialMode:true,musicPricePerLesson:true,musicTeacherFeeBase:true}});
  const rows=await tx.courseTemplate.findMany({where:{storeId,musicSubjectId:subjectId,isActive:true,visibility:{not:"OFF"},id:{not:{startsWith:"teaching"}},musicTrialMode:{in:["FREE","PAID"]}},select:{musicTrialMode:true,musicPricePerLesson:true,musicTeacherFeeBase:true}});
  if(new Set(rows.map(row=>`${row.musicTrialMode}:${row.musicPricePerLesson}`)).size>1)throw new AppError("VALIDATION","這個教學項目有不同體驗學費，請先在班型與學費確認體驗費用");
  return rows[0]??null;
}

/** Capture each tuition version when creating a class. Existing teacher overrides retain priority. */
export async function captureTeachingTuitionFees(tx:Pick<Prisma.TransactionClient,"$executeRaw">,storeId:string,requestKey:string,sessionIds:string[]|null=null) {
  await tx.$executeRaw`
    UPDATE "CourseCompensationSnapshot" snap
    SET rule=snap.rule || jsonb_build_object('tuitionRules',captured.rules,'tuitionRuleVersion',1,'calculationVersion',2),revision=GREATEST(snap.revision,1)
    FROM "CourseSession" session, LATERAL (
      SELECT jsonb_object_agg(tuition.id, COALESCE(
        comp.rules->0 || jsonb_build_object('revision',comp.revision,'source','TUITION_OVERRIDE'),
        teaching_comp.rules->0 || jsonb_build_object('revision',teaching_comp.revision,'source','PLAN_OVERRIDE'),
        settings."subjectRules"->teaching."musicSubjectId",
        CASE WHEN settings."defaultRatio" IS NOT NULL THEN jsonb_build_object('mode','SHARE','value',round((settings."defaultRatio"*100)::numeric,2),'source','TEACHER_DEFAULT') END,
        CASE WHEN tuition."musicTeacherShare" IS NOT NULL THEN jsonb_build_object('mode','SHARE','value',round((tuition."musicTeacherShare"*100)::numeric,2),'source','PRODUCT_DEFAULT') END,
        '{"mode":"UNSET"}'::jsonb)) AS rules
      FROM "CourseTemplate" teaching
      JOIN "CourseTemplate" tuition ON tuition."storeId"=teaching."storeId" AND tuition."musicSubjectId"=teaching."musicSubjectId"
      LEFT JOIN "CourseCompensation" comp ON comp."storeId"=session."storeId" AND comp."staffId"=session."coachId" AND comp."templateId"=tuition.id
        AND jsonb_array_length(comp.rules)=1 AND comp.rules->0->>'mode' IN ('CLASS','SHARE')
      LEFT JOIN "CourseCompensation" teaching_comp ON teaching_comp."storeId"=session."storeId" AND teaching_comp."staffId"=session."coachId" AND teaching_comp."templateId"=teaching.id
        AND jsonb_array_length(teaching_comp.rules)=1 AND teaching_comp.rules->0->>'mode' IN ('CLASS','SHARE')
      LEFT JOIN "CourseTeacherCompensationSetting" settings ON settings."storeId"=session."storeId" AND settings."staffId"=session."coachId"
      WHERE teaching.id=session."templateId" AND teaching."storeId"=session."storeId" AND NOT starts_with(tuition.id,'teaching') AND tuition."musicTrialMode" IS NULL
    ) captured
    WHERE session."storeId"=${storeId} AND session."requestKey"=${requestKey} AND (${sessionIds}::text[] IS NULL OR session.id=ANY(${sessionIds}::text[]))
      AND snap."sessionId"=session.id AND snap."storeId"=session."storeId" AND captured.rules IS NOT NULL`;
}
