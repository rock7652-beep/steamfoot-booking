import { musicDataSeparationEnabled } from "./music-data-scope";
import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "../../../generated/course-client";
import { AppError } from "@/lib/errors";
import { musicClassLabel, type MusicSubjectRule } from "@/lib/music-subject-rule";

/** Reuse a matching rule or create a new version. Never rewrite a booked template. */
export async function resolveMusicSubjectRule(tx:Prisma.TransactionClient,storeId:string,rule:MusicSubjectRule) {
  const {subjectId,totalPrice: _totalPrice,...settings}=rule;
  const subject=await tx.musicSubject.findFirst({where:{id:subjectId,storeId,isActive:true}});
  if(!subject)throw new AppError("VALIDATION","請選擇本店上架中的課程項目");
  const item = musicDataSeparationEnabled(storeId) ? await tx.courseTemplate.findFirst({where:{storeId,musicSubjectId:subjectId,isActive:true,classType:{not:null}},orderBy:[{createdAt:"asc"},{id:"asc"}]}) : null;
  if(item?.classType && item.classType!==settings.classType)throw new AppError("VALIDATION","授課型態由教學項目決定；不同型態請另建項目");
  if(item){settings.musicScheduleMode=item.musicScheduleMode==="APPOINTMENT"?"APPOINTMENT":"FIXED";}
  const existing=await tx.courseTemplate.findFirst({where:{storeId,musicSubjectId:subjectId,isActive:true,visibility:"PUBLIC",musicTrialMode:null,...settings},orderBy:{createdAt:"asc"}});
  if(existing)return existing;
  const name=`${subject.name} · ${musicClassLabel[settings.classType]} ${settings.musicTermLessons}堂`;
  const duplicate=await tx.courseTemplate.findFirst({where:{storeId,name},select:{id:true}});
  return tx.courseTemplate.create({data:{storeId,musicSubjectId:subjectId,...settings,
    name:duplicate?`${name} · ${randomUUID().slice(0,6)}`:name,
    category:subject.category,description:subject.description,durationMinutes:item?.durationMinutes??60,pointCost:1,
    capacity:item?.capacity??(settings.classType==="PRIVATE"?1:settings.classType==="SELF_ORGANIZED"?3:15),
  }});
}
