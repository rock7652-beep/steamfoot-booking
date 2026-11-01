import {memoizeCourseReadRequest} from "./course-read-request-memo";
import 'server-only';
import type {Prisma} from '../../../generated/course-client';
/** Verified same-store teaching-item aliases, including old fee templates.
 * Callers pass these only as server-derived lesson evidence, never client input. */
export async function readSportsTeachingTemplates(tx:Pick<Prisma.TransactionClient,'courseTemplate'>,storeId:string,subjectId:string|null|undefined){
 if(!subjectId)return [];
 return memoizeCourseReadRequest(tx,JSON.stringify(['sports-teaching',storeId,subjectId]),async()=>{
  const templates=await tx.courseTemplate.findMany({where:{storeId,musicSubjectId:subjectId},select:{id:true}});
  return templates.map(t=>t.id);
 });
}

/** Existing purchased rights projected for the native scheduling picker only. */
export function sportsAssignedStudentSubjects(storeId:string,card:{sportsMode?:string;unit:string;templateIds:string[];sportsSubjectId:string|null;requestKey:string},templates:Array<{id:string;storeId:string;musicSubjectId:string|null}>){
 if(card.sportsMode==='ASSIGNED')return card.sportsSubjectId?[card.sportsSubjectId]:[];
 if(card.sportsMode!=='LEGACY'||card.unit!=='SESSION'||card.requestKey.startsWith('no-show-makeup:'))return [];
 return [...new Set(templates.filter(t=>t.storeId===storeId&&card.templateIds.includes(t.id)&&t.musicSubjectId).map(t=>t.musicSubjectId!))];
}
