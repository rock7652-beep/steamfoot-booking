import {toLocalDateStr} from '@/lib/date-utils';

export type WeekOverlapGroup<T> = {id:string;startsAt:string;endsAt:string;sessions:T[]};
/** Group connected overlaps within each Taiwan date; touching end/start times stay separate. */
export function courseWeekOverlaps<T extends {id:string;startsAt:string;endsAt:string}>(sessions:readonly T[]):WeekOverlapGroup<T>[] {
 const days=new Map<string,T[]>();
 for(const session of sessions){const date=toLocalDateStr(new Date(session.startsAt));const rows=days.get(date)??[];rows.push(session);days.set(date,rows);}
 const result:WeekOverlapGroup<T>[]=[];
 for(const rows of days.values()){
  rows.sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt)||a.id.localeCompare(b.id));
  let current:WeekOverlapGroup<T>|undefined;
  for(const session of rows){
   if(!current||Date.parse(session.startsAt)>=Date.parse(current.endsAt)){
    current={id:session.id,startsAt:session.startsAt,endsAt:session.endsAt,sessions:[session]};result.push(current);
   }else{
    current.sessions.push(session);
    if(Date.parse(session.endsAt)>Date.parse(current.endsAt))current.endsAt=session.endsAt;
   }
  }
 }
 return result.sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt)||a.id.localeCompare(b.id));
}
