import "server-only";
import type {Prisma} from "../../../generated/course-client";

/** Catalogs and editors must receive saved defaults, not only subject metadata.
 * Prefer the internal schedule; older subjects use their earliest version. */
export async function readMusicSubjectDefaults(tx:Pick<Prisma.TransactionClient,"courseTemplate">,storeId:string,subjectIds:string[]){
  if(!subjectIds.length)return new Map<string,{durationMinutes:number;visibility:string;precautions:string}>();
  const versions=await tx.courseTemplate.findMany({
    where:{storeId,musicSubjectId:{in:[...new Set(subjectIds)]}},
    select:{id:true,musicSubjectId:true,durationMinutes:true,visibility:true,precautions:true},
    orderBy:[{createdAt:"asc"},{id:"asc"}],
  });
  const defaults=new Map<string,{durationMinutes:number;visibility:string;precautions:string}>();
  for(const version of versions){
    const id=version.musicSubjectId;
    if(id&&(!defaults.has(id)||version.id===`subject_schedule_${id}`))
      defaults.set(id,{durationMinutes:version.durationMinutes,visibility:version.visibility,precautions:version.precautions});
  }
  return defaults;
}
