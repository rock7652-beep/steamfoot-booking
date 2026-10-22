import {addTaiwanDuration,toLocalDateStr} from '@/lib/date-utils';
import {beautyBusinessMetrics} from './business-metrics';
import {beautyTrend,type BeautyTrendRow} from './analytics';
import {businessComparisonRange,type BusinessScope} from '@/lib/course-business-analytics';
import type {CourseBusinessReport} from '@/server/queries/course-business-analytics';

type Visit={id:string;customerId:string|null;personName:string;technicianId:string;status:string;isTrial:boolean;startsAt:Date;endsAt:Date};
type Card={id:string;customerId:string;createdAt:Date};
type Person={id:string;name:string};
/** Presentation adapter only: no Course DB, attendance action, or quota/ledger writes. */
export function beautyBusinessReport({visits,cards,customers,technicians,rows,range,scope,createdDate,canCustomers,canPlans,finance,now=new Date()}:{visits:Visit[];cards:Card[];customers:Person[];technicians:Person[];rows:BeautyTrendRow[];range:{startDate:string;endDate:string};scope:BusinessScope;createdDate:string;canCustomers:boolean;canPlans:boolean;finance:boolean;now?:Date}):CourseBusinessReport {
 const today=toLocalDateStr(now),endDate=range.endDate<today?range.endDate:today;
 const completed=visits.filter(v=>v.status==='COMPLETED'&&v.startsAt<=now);
 const scoped=completed.filter(v=>scope.view==='store'||scope.person==='all'||v.technicianId===scope.person);
 const inRange=(d:Date,r=range)=>{const day=toLocalDateStr(d);return day>=r.startDate&&day<=r.endDate;};
 const people=new Map(customers.map(c=>[c.id,c.name]));
 const visitsCount=new Map<string,number>();for(const v of scoped.filter(v=>inRange(v.startsAt)))if(v.customerId)visitsCount.set(v.customerId,(visitsCount.get(v.customerId)??0)+1);
 const list=(ids:(string|null)[])=>[...new Set(ids)].filter((id):id is string=>!!id).map(id=>({id,name:people.get(id)??'歷史顧客',visits:visitsCount.get(id)??0}));
 const summarize=(r:typeof range)=>{
  const current=scoped.filter(v=>inRange(v.startsAt,r)),business=beautyBusinessMetrics(scoped,cards,r);
  const visitors=list(current.map(v=>v.customerId)),trial=list(current.filter(v=>v.isTrial).map(v=>v.customerId));
  const firstVisit=new Map<string,Date>();for(const v of completed)if(v.customerId&&(!firstVisit.has(v.customerId)||v.startsAt<firstVisit.get(v.customerId)!))firstVisit.set(v.customerId,v.startsAt);
  const sorted=[...cards].sort((a,b)=>+a.createdAt-+b.createdAt||a.id.localeCompare(b.id)),seen=new Set<string>();
  const sales=sorted.map(c=>{const renewal=seen.has(c.customerId);seen.add(c.customerId);return {...c,renewal};});
  // Plan sales have no technician attribution in Beauty: do not assign buyer sales to a guessed technician.
  const periodSales=canPlans&&scope.view==='store'?sales.filter(c=>inRange(c.createdAt,r)):[];
  const firstTrial=new Map<string,Date>();for(const v of [...scoped].sort((a,b)=>+a.startsAt-+b.startsAt))if(v.isTrial&&v.customerId&&!firstTrial.has(v.customerId))firstTrial.set(v.customerId,v.startsAt);
  const eligible=[...firstTrial].filter(([,date])=>inRange(date,r));
  const converted=eligible.filter(([id,date])=>cards.some(c=>c.customerId===id&&c.createdAt>=date&&toLocalDateStr(c.createdAt)<=r.endDate)).map(([id])=>id);
  const before=scoped.filter(v=>toLocalDateStr(v.startsAt)<r.startDate);
  const base=list(before.map(v=>v.customerId));
  const retentionRange=before.length?{startDate:toLocalDateStr(new Date(Math.min(...before.map(v=>+v.startsAt)))),endDate:addTaiwanDuration(r.startDate,-1,'DAY')}:null;
  const returned=base.filter(p=>visitors.some(v=>v.id===p.id)),notReturned=base.filter(p=>!visitors.some(v=>v.id===p.id));
  const segments={visitors,trial,newVisitors:visitors.filter(v=>inRange(firstVisit.get(v.id)!,r)),oldVisitors:visitors.filter(v=>!inRange(firstVisit.get(v.id)!,r)),newCard:list(periodSales.filter(c=>!c.renewal).map(c=>c.customerId)),renewal:list(periodSales.filter(c=>c.renewal).map(c=>c.customerId)),converted:list(converted),unconverted:list(eligible.filter(([id])=>!converted.includes(id)).map(([id])=>id)),tracked:list(periodSales.filter(c=>!c.renewal&&firstTrial.has(c.customerId)&&toLocalDateStr(firstTrial.get(c.customerId)!)<r.startDate).map(c=>c.customerId)),returned,notReturned};
  return {segments,attendance:current.length,sessions:current.length,hours:current.reduce((n,v)=>n+(+v.endsAt-+v.startsAt)/3600000,0),eligibleTrials:eligible.length,conversionRate:business.conversionRate,retentionBase:base.length,retentionRate:base.length?returned.length/base.length*100:null,retentionRange};
 };
 const summary=summarize(range),comparisonWindow=businessComparisonRange(range,now),prior=comparisonWindow?summarize(comparisonWindow.range):null;
 const filteredRows=rows.filter(r=>scope.view==='store'||scope.person==='all'||r.technicianId===scope.person);
 const trendMetric=(r:typeof range,monthly=false)=>{
  const dates=beautyTrend(filteredRows,r,monthly?'year':'current','completed','',createdDate,today);
  return dates.map(d=>{const matching=filteredRows.filter(row=>row.date.slice(0,d.date.length)===d.date);return {date:d.date,available:d.value!==null,attendance:d.value??0,trial:new Set(scoped.filter(v=>v.isTrial&&toLocalDateStr(v.startsAt).slice(0,d.date.length)===d.date&&v.customerId).map(v=>v.customerId)).size,newCard:matching.reduce((n,v)=>n+(v.newCard??0),0),renewal:matching.reduce((n,v)=>n+(v.renewal??0),0),...(finance?{revenue:matching.reduce((n,v)=>n+v.revenue,0)}:{})};});
 };
 return {...summary,pendingProfit:[],pendingFees:[],scope,range,staff:technicians.map(t=>({id:t.id,displayName:t.name,courseCoachEnabled:true,user:{role:'CUSTOMER' as const}})),coverageStart:createdDate,effectiveEndDate:endDate,comparison:prior&&comparisonWindow?{...comparisonWindow,attendance:prior.attendance,trial:prior.segments.trial.length,newCard:prior.segments.newCard.length,renewal:prior.segments.renewal.length,conversionRate:prior.conversionRate}:null,monthlyTrend:trendMetric({startDate:addTaiwanDuration(range.endDate.slice(0,7)+'-01',-11,'MONTH'),endDate:range.endDate},true),counts:Object.fromEntries(Object.entries(summary.segments).map(([k,v])=>[k,v.length])) as CourseBusinessReport['counts'],segments:canCustomers?summary.segments:null,fee:null,missingFees:0,profit:null,knownProfit:0,missingProfit:0,netRevenue:finance?filteredRows.filter(r=>r.date>=range.startDate&&r.date<=endDate).reduce((n,v)=>n+v.revenue,0):null,trend:trendMetric(range)};
}
