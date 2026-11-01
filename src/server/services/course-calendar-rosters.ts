import 'server-only';
import {withReadRequestMemo} from './read-request-memo';
import {withPermissionRequestSession} from '@/lib/permission-request-session';
import {courseManager} from './course-access';
import {readAuthorizedCourseSessionDetail} from '@/server/queries/authorized-course-session-detail';
import {withCourseCalendarRead,courseCalendarRead} from './course-calendar-read-scope';
import {coursePrisma} from '@/lib/course-db';
import {AppError,handleActionError} from '@/lib/errors';
import {collectCalendarRosters} from './calendar-roster-preload';
import type {CalendarRosterSnapshots} from '@/app/(dashboard)/dashboard/courses/roster-source';

/** A calendar-owned snapshot, freshly authorized on every page/month read.
 * Mutations continue through the original authoritative actions. */
export function preloadCourseCalendarRosters(storeId:string,sessionIds:readonly string[]):Promise<CalendarRosterSnapshots>{
 return withReadRequestMemo(()=>withPermissionRequestSession(async()=>{
  const authorizationStart=performance.now();
  const actor=await courseManager('booking.read');
  if(actor.storeId!==storeId)throw new AppError('FORBIDDEN','店家已切換，請重新開啟課表');
  const authorizationMs=Math.round(performance.now()-authorizationStart);
  const details=await withCourseCalendarRead(storeId,sessionIds,async()=>{
   const start=performance.now();
   let completed=false;
   try{
    const data=await collectCalendarRosters(sessionIds,async id=>{try{return await readAuthorizedCourseSessionDetail(actor,id,true,false);}catch(error){return handleActionError(error);}});
    completed=true;return data;
   }finally{
    const scope=courseCalendarRead(coursePrisma,storeId);
    console.info('[calendar-roster-preload]',{sessions:new Set(sessionIds).size,completed,authorizationMs,elapsedMs:Math.round(performance.now()-start),sharedReads:scope?.sharedReadCount(),reads:scope?.sharedReadTimings()});
   }
  });
  return {storeId,details};
 }));
}
