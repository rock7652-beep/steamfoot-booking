import 'server-only';
import {withReadRequestMemo} from './read-request-memo';
import {withPermissionRequestSession} from '@/lib/permission-request-session';
import {courseManager} from './course-access';
import {loadCourseSessionDetail} from '@/server/actions/course-members';
import {AppError} from '@/lib/errors';
import {collectCalendarRosters} from './calendar-roster-preload';
import type {CalendarRosterSnapshots} from '@/app/(dashboard)/dashboard/courses/roster-source';

/** A calendar-owned snapshot, freshly authorized on every page/month read.
 * Mutations continue through the original authoritative actions. */
export function preloadCourseCalendarRosters(storeId:string,sessionIds:readonly string[]):Promise<CalendarRosterSnapshots>{
 return withReadRequestMemo(()=>withPermissionRequestSession(async()=>{
  const actor=await courseManager('booking.read');
  if(actor.storeId!==storeId)throw new AppError('FORBIDDEN','店家已切換，請重新開啟課表');
  const details=await collectCalendarRosters(sessionIds,id=>loadCourseSessionDetail(id,true,false));
  return {storeId,details};
 }));
}
