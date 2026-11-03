import {addTaiwanDuration,dayRange,toLocalDateStr} from '@/lib/date-utils';
export type BeautyTrendRow={date:string;technicianId:string|null;managerId?:string|null;reserved:number;completed:number;trial:number;revenue:number;newCard?:number;renewal?:number};
export function beautyTrend(rows:BeautyTrendRow[],range:{startDate:string;endDate:string},period:'current'|'months'|'year',metric:'reserved'|'completed'|'trial'|'revenue'|'newCard'|'renewal',technicianId:string,createdDate:string,today:string){
 const monthly=period!=='current';const end=monthly?range.endDate.slice(0,7)+'-01':range.endDate;
 const start=monthly?addTaiwanDuration(end,period==='year'?-11:-5,'MONTH'):range.startDate;
 const count=monthly?(period==='year'?12:6):Math.round((+dayRange(end).start-+dayRange(start).start)/86400000)+1;
 return Array.from({length:Math.max(0,Math.min(count,366))},(_,i)=>{
  const date=addTaiwanDuration(start,i,monthly?'MONTH':'DAY').slice(0,monthly?7:10);
  const all=rows.filter(r=>r.date.slice(0,date.length)===date);
  const selected=all.filter(r=>!technicianId||r.technicianId===technicianId);
  const available=all.length>0||(date>=createdDate.slice(0,date.length)&&date<=today.slice(0,date.length));
  return {date,value:available?selected.reduce((n,r)=>n+(r[metric]??0),0):null};
 });
}
export function beautyAnalysisBounds(range:{startDate:string;endDate:string}){
 if(+dayRange(range.endDate).start-+dayRange(range.startDate).start>365*86400000)throw new Error('請選擇一年內的分析期間');
 const trendStart=addTaiwanDuration(range.endDate.slice(0,7)+'-01',-11,'MONTH');
 return {start:dayRange(range.startDate<trendStart?range.startDate:trendStart).start,end:dayRange(range.endDate).end};
}
export const beautyAnalysisToday=()=>toLocalDateStr();
