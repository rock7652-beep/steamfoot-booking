import "server-only";
import {musicTeachingSubjectId} from "@/lib/music-teaching-item";
import type { Prisma } from "../../../generated/course-client";
import { musicDataSeparationEnabled } from "./music-data-scope";

/** Pricing versions of one item share eligibility. Historical template bindings remain intact. */
export async function musicItemTemplateIds(
  tx: Pick<Prisma.TransactionClient, "courseTemplate">, storeId: string, templateId: string,
): Promise<string[]> {
  const subjectId=musicTeachingSubjectId(templateId);
  if(subjectId){
    const versions=await tx.courseTemplate.findMany({where:{storeId,musicSubjectId:subjectId,musicTrialMode:null},select:{id:true}});
    return [...new Set([templateId,...versions.map(row=>row.id)])];
  }
  if (!musicDataSeparationEnabled(storeId)) return [templateId];
  const target = await tx.courseTemplate.findFirst({ where: { id: templateId, storeId }, select: { musicSubjectId: true, classType: true, musicTrialMode: true } });
  if (!target?.musicSubjectId) return [templateId];
  const versions = await tx.courseTemplate.findMany({
    where: { storeId, musicSubjectId: target.musicSubjectId, classType: target.classType, musicTrialMode: target.musicTrialMode },
    select: { id: true },
  });
  return versions.map(version => version.id);
}

export async function courseCardMatchesItem(
  tx: Pick<Prisma.TransactionClient, "courseTemplate">, storeId: string, templateIds: string[], templateId: string,
) {
  if (!templateIds.length || templateIds.includes(templateId)) return true;
  return (await musicItemTemplateIds(tx, storeId, templateId)).some(id => templateIds.includes(id));
}
