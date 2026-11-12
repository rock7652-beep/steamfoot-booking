import 'server-only';
import {randomUUID} from 'node:crypto';
import type {Prisma} from '@prisma/client';
import {sportsTeachingTemplateId} from './sports-teaching-rule';
import {musicSubjectDefaultId} from '@/lib/course-plan-compensation';
/** Materialize selected item identities on a staff save, never during a read.
 * No tuition, price or compensation is created by assigning a qualification.
 */
export async function ensureQualificationTemplates(tx:Pick<Prisma.TransactionClient,'$queryRaw'|'$executeRaw'>,storeId:string,ids:string[],sports:boolean){
 const candidates=ids.filter(id=>id.startsWith(sports?'sports_item_':'subject_schedule_'));
 if(!candidates.length)return;
 const subjects=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "MusicSubject" WHERE "storeId"=${storeId} AND "isActive"=true`;
 for(const subject of subjects){
  const id=sports?sportsTeachingTemplateId(storeId,subject.id):musicSubjectDefaultId(subject.id);
  if(!candidates.includes(id))continue;
  await tx.$executeRaw`INSERT INTO "CourseTemplate" (id,"storeId",name,"musicSubjectId","durationMinutes","pointCost",capacity,"updatedAt",visibility,precautions,description,"musicScheduleMode")
   SELECT ${id},${storeId},${`授課資格 · ${randomUUID()}`},${subject.id},COALESCE(prior."durationMinutes",${sports?60:50}),1,500,NOW(),COALESCE(prior.visibility,'PUBLIC'),COALESCE(prior.precautions,''),COALESCE(prior.description,''),prior."musicScheduleMode"
   FROM (SELECT 1) anchor LEFT JOIN LATERAL (
    SELECT "durationMinutes",visibility,precautions,description,"musicScheduleMode" FROM "CourseTemplate"
    WHERE "storeId"=${storeId} AND "musicSubjectId"=${subject.id} ORDER BY "createdAt",id LIMIT 1
   ) prior ON true ON CONFLICT(id) DO NOTHING`;
 }
}
