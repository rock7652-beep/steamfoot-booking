import 'server-only';
import {beautyPrisma} from '@/lib/beauty-db';
import {AppError} from '@/lib/errors';
import {toLocalDateStr} from '@/lib/date-utils';
import {withReadRequestMemo} from '@/server/services/read-request-memo';
import {withPermissionRequestSession} from '@/lib/permission-request-session';
import {beautyRosterContext,loadBeautyRoster} from './roster-read';
import type {CalendarRosterSnapshots,CourseRosterData} from '@/app/(dashboard)/dashboard/courses/roster-source';

/** Read all selected groups once, then project the exact group/day roster rows.
 * Cards, holds and charges use the original authorized roster query. */
export function preloadBeautyCalendarRosters(storeId:string,visible:readonly {id:string;groupId:string}[],dates:readonly string[]):Promise<CalendarRosterSnapshots>{
 return withReadRequestMemo(()=>withPermissionRequestSession(async()=>{
  const ctx=await beautyRosterContext();
  if(ctx.a.storeId!==storeId)throw new AppError('FORBIDDEN','店家已切換，請重新開啟班表');
  const groupIds=[...new Set(visible.map(row=>row.groupId))];
  const [groups,result]=await Promise.all([
   beautyPrisma.beautyAppointment.findMany({where:{storeId,groupId:{in:groupIds}},select:{id:true,groupId:true}}),
   loadBeautyRoster(ctx,{groupId:{in:groupIds}}),
  ]);
  const groupById=new Map(groups.map(row=>[row.id,row.groupId]));
  const details:CalendarRosterSnapshots['details']={};
  const project=(rows:CourseRosterData['roster']):CourseRosterData=>({...result.data,roster:rows,session:{...result.data.session,startsAt:rows[0]?.service?.startsAt??''}});
  const byGroup=new Map(groupIds.map(id=>[id,project(result.data.roster.filter(row=>groupById.get(row.id)===id))]));
  for(const row of visible)details[`booking:${row.id}`]=byGroup.get(row.groupId)!;
  for(const date of dates)details[`day:${date}`]=project(result.data.roster.filter(row=>!!row.service&&toLocalDateStr(new Date(row.service.startsAt))===date));
  return {storeId,details};
 }));
}
