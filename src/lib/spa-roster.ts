import { parseTaiwanDateToDbDate } from "@/lib/date-utils";
import { staffAvailable } from "@/lib/spa-scheduling";
export type Shift = { startTime: string; endTime: string };
export type RosterException = { type: string; startTime: string | null; endTime: string | null };
// Explicit dates override the weekly template by blocking every gap, including breaks.
export function dateShiftExceptions(shifts: Shift[]) {
  const sorted = [...shifts].sort((a,b)=>a.startTime.localeCompare(b.startTime));
  const rows: {type:"AVAILABLE"|"UNAVAILABLE";startTime:string;endTime:string}[] = [];
  let cursor="00:00";
  for(const shift of sorted){
    if(cursor<shift.startTime) rows.push({type:"UNAVAILABLE",startTime:cursor,endTime:shift.startTime});
    rows.push({type:"AVAILABLE",...shift}); cursor=shift.endTime;
  }
  if(cursor<"24:00") rows.push({type:"UNAVAILABLE",startTime:cursor,endTime:"24:00"});
  return rows;
}
export function effectiveShifts(regular: (Shift & {isActive:boolean}) | null, exceptions: RosterException[]): Shift[] {
  const points=[...new Set(["00:00","24:00",...(regular?[regular.startTime,regular.endTime]:[]),...exceptions.flatMap(e=>[e.startTime??"00:00",e.endTime??"24:00"])])].sort();
  const result:Shift[]=[];
  for(let i=0;i<points.length-1;i++){
    const startTime=points[i],endTime=points[i+1];
    if(!staffAvailable(startTime,endTime,regular,exceptions))continue;
    const last=result[result.length-1];
    if(last?.endTime===startTime)last.endTime=endTime;else result.push({startTime,endTime});
  }
  return result;
}

export function previousWeekDates(anchor:string){
 const date=parseTaiwanDateToDbDate(anchor);
 const monday=new Date(date);monday.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7));
 const format=(d:Date)=>`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
 return Array.from({length:7},(_,i)=>{const target=new Date(monday);target.setUTCDate(monday.getUTCDate()+i);const source=new Date(target);source.setUTCDate(target.getUTCDate()-7);return{target:format(target),source:format(source)};});
}
