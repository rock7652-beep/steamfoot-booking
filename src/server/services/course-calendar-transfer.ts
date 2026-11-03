import 'server-only';
import {isDeepStrictEqual} from 'node:util';
import type {CalendarRosterSnapshots} from '@/app/(dashboard)/dashboard/courses/roster-source';

type Detail=CalendarRosterSnapshots['details'][string];
/** RSC preserves object references. Reuse equal read-only metadata within this
 * one snapshot so it is sent once. Never share learners, rights or bookings. */
export function shareCalendarRosterMetadata(snapshot:CalendarRosterSnapshots):CalendarRosterSnapshots{
 const aliases=new Map<string,string[][]>(),trials=new Map<string,NonNullable<Detail['trial']>[]>();
 function intern<T>(values:Map<string,T[]>,value:T):T{
  const key=JSON.stringify(value),bucket=values.get(key)??[];
  const existing=bucket.find(candidate=>isDeepStrictEqual(candidate,value));
  if(existing!==undefined)return existing;
  bucket.push(value);values.set(key,bucket);return value;
 }
 const details=Object.fromEntries(Object.entries(snapshot.details).map(([id,data]):[string,Detail]=>{
  const ids=data.session.compatibleTemplateIds;
  // Empty arrays are smaller inline than an RSC reference. Keep them as-is.
  const compatible=ids?.length?intern(aliases,ids):ids;
  const session=compatible===ids?data.session:{...data.session,compatibleTemplateIds:compatible};
  if(data.trial===null)return [id,{...data,session}];
  const trial=!data.trial.customers.length?intern(trials,data.trial):data.trial;
  return [id,{...data,trial,session}];
 }));
 return {storeId:snapshot.storeId,details};
}
