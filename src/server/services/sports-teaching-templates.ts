import 'server-only';
import type {Prisma} from '../../../generated/course-client';
/** Verified same-store teaching-item aliases, including old fee templates.
 * Callers pass these only as server-derived lesson evidence, never client input. */
export async function readSportsTeachingTemplates(tx:Pick<Prisma.TransactionClient,'courseTemplate'>,storeId:string,subjectId:string|null|undefined){
 if(!subjectId)return [];
 const templates=await tx.courseTemplate.findMany({where:{storeId,musicSubjectId:subjectId},select:{id:true}});
 return templates.map(t=>t.id);
}
