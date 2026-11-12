import {courseCalendarRead} from './course-calendar-read-scope';
import {memoizeCourseReadRequest} from "./course-read-request-memo";
import {sportsOpenPlanTemplateIds} from '@/lib/sports-entitlement';
import 'server-only';
import type {Prisma} from '../../../generated/course-client';
/** Verified same-store teaching-item aliases, including old fee templates.
 * Callers pass these only as server-derived lesson evidence, never client input. */
export async function readSportsTeachingTemplates(tx:Pick<Prisma.TransactionClient,'courseTemplate'>,storeId:string,subjectId:string|null|undefined){
 if(!subjectId)return [];
 const calendar=courseCalendarRead(tx,storeId);
 if(calendar){
  const templates=await calendar.once('teaching-template-versions',()=>tx.courseTemplate.findMany({where:{storeId},select:{id:true,musicSubjectId:true,musicTrialMode:true}}));
  return templates.filter(row=>row.musicSubjectId===subjectId).map(row=>row.id);
 }
 return memoizeCourseReadRequest(tx,JSON.stringify(['sports-teaching',storeId,subjectId]),async()=>{
  const templates=await tx.courseTemplate.findMany({where:{storeId,musicSubjectId:subjectId},select:{id:true}});
  return templates.map(t=>t.id);
 });
}

/** Existing purchased rights projected for the native scheduling picker only. */
export function sportsAssignedStudentSubjects(storeId:string,card:Parameters<typeof sportsOpenPlanTemplateIds>[0]&{templateIds:string[];sportsSubjectId:string|null;requestKey:string},templates:Array<{id:string;storeId:string;musicSubjectId:string|null}>){
 if(card.sportsMode==='SUBJECTS')return (card.sportsSubjectIds??[]).filter(id=>templates.some(t=>t.storeId===storeId&&t.musicSubjectId===id));
 if(card.sportsMode==='ASSIGNED')return card.sportsSubjectId?[card.sportsSubjectId]:[];
 if(card.unit!=='SESSION'||card.requestKey.startsWith('no-show-makeup:'))return [];
 const templateIds=card.sportsMode==='LEGACY'?card.templateIds:sportsOpenPlanTemplateIds(card);
 return [...new Set(templates.filter(t=>t.storeId===storeId&&templateIds.includes(t.id)&&t.musicSubjectId).map(t=>t.musicSubjectId!))];
}
