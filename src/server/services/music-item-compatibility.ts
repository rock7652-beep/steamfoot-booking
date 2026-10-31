import {memoizeCourseReadRequest} from "./course-read-request-memo";
import "server-only";
import {musicTeachingSubjectId} from "@/lib/music-teaching-item";
import type { Prisma } from "../../../generated/course-client";

/** Pricing versions of one item share eligibility. Historical template bindings remain intact. */
export async function musicItemTemplateIds(
  tx: Pick<Prisma.TransactionClient, "courseTemplate">, storeId: string, templateId: string,
): Promise<string[]> {
  return memoizeCourseReadRequest(tx,JSON.stringify(["music-item-templates",storeId,templateId]),async()=>{
  const subjectId=musicTeachingSubjectId(templateId);
  if(subjectId){
    const versions=await tx.courseTemplate.findMany({where:{storeId,musicSubjectId:subjectId,musicTrialMode:null},select:{id:true}});
    return [...new Set([templateId,...versions.map(row=>row.id)])];
  }
  const target = await tx.courseTemplate.findFirst({ where: { id: templateId, storeId }, select: { musicSubjectId: true, classType: true, musicTrialMode: true } });
  if (!target?.musicSubjectId) return [templateId];
  const versions = await tx.courseTemplate.findMany({
    where: { storeId, musicSubjectId: target.musicSubjectId, musicTrialMode: target.musicTrialMode },
    select: { id: true },
  });
  return versions.map(version => version.id);
  });
}

export async function courseCardMatchesItem(
  tx: Pick<Prisma.TransactionClient, "courseTemplate">, storeId: string, templateIds: string[], templateId: string,
) {
  if (!templateIds.length || templateIds.includes(templateId)) return true;
  return (await musicItemTemplateIds(tx, storeId, templateId)).some(id => templateIds.includes(id));
}
