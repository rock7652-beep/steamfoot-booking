import {toLocalDateStr,formatTWDateTime} from '@/lib/date-utils';
type TimedItem={id:string;groupId:string;status:string;startsAt:string;endsAt:string};
export function memberAppointmentGroups<T extends TimedItem>(items:T[],history:boolean,now:number){
 const groups=new Map<string,T[]>();
 for(const item of items){
  const upcoming=item.status==='RESERVED'&&Date.parse(item.endsAt)>=now;
  if(upcoming===history)continue;
  const key=item.groupId+':'+toLocalDateStr(new Date(item.startsAt));
  groups.set(key,[...(groups.get(key)??[]),item]);
 }
 return [...groups].map(([key,rows])=>({key,items:rows.sort((a,b)=>a.startsAt.localeCompare(b.startsAt))})).sort((a,b)=>history?b.items[b.items.length-1].startsAt.localeCompare(a.items[a.items.length-1].startsAt):a.items[0].startsAt.localeCompare(b.items[0].startsAt));
}
export function beautyServiceTime(startsAt:string,endsAt:string){
 const a=formatTWDateTime(new Date(startsAt)),b=formatTWDateTime(new Date(endsAt));
 return `${a.slice(11)}–${a.slice(0,10)===b.slice(0,10)?b.slice(11):b}`;
}
