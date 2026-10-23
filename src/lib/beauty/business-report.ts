import {addTaiwanDuration,monthRange,toLocalDateStr} from '@/lib/date-utils';
import {beautyTrend,type BeautyTrendRow} from './analytics';
import {businessComparisonRange,summarizeCourseBusiness,type BusinessScope} from '@/lib/course-business-analytics';
import type {CourseBusinessReport} from '@/server/queries/course-business-analytics';

type Visit={id:string;customerId:string|null;personName:string;technicianId:string;status:string;isTrial:boolean;startsAt:Date;endsAt:Date};
type Card={id:string;customerId:string;createdAt:Date;paid:number;revenueStaffId:string|null;refunds:{amount:number;createdAt:Date}[]};
type Person={id:string;name:string;assignedStaff?:{id:string}|null};
type Manager={id:string;displayName:string;user:{role:CourseBusinessReport['staff'][number]['user']['role']}};
/** Normalize Beauty records into the original sports business statistics core. */
export function beautyBusinessReport({visits,cards,customers,technicians,managers=[],rows,range,scope,createdDate,canCustomers,canPlans,finance,now=new Date()}:{visits:Visit[];cards:Card[];customers:Person[];technicians:Person[];managers?:Manager[];rows:BeautyTrendRow[];range:{startDate:string;endDate:string};scope:BusinessScope;createdDate:string;canCustomers:boolean;canPlans:boolean;finance:boolean;now?:Date}):CourseBusinessReport {
 const today=toLocalDateStr(now),endDate=range.endDate<today?range.endDate:today;
 const managerMap=new Map(customers.map(c=>[c.id,c.assignedStaff?.id??null]));
 const matches=(id:string|null|undefined)=>scope.person==='all'||(id??'unassigned')===scope.person;
 const input={
  customers:customers.map(c=>({id:c.id,name:c.name,managerId:c.assignedStaff?.id??null})),
  sessions:visits.filter(v=>v.status==='COMPLETED'&&v.startsAt<=now).map(v=>({id:v.id,coachId:v.technicianId,startsAt:v.startsAt,endsAt:v.endsAt,bookings:[{customerId:v.customerId,customerName:v.personName,bookingKind:v.isTrial?'TRIAL':'REGULAR',status:'ATTENDED'}]})),
  purchases:canPlans?cards.map(c=>({id:c.id,customerId:c.customerId,confirmedAt:c.createdAt,price:c.paid,revenueStaffId:c.revenueStaffId,developerProfitSnapshot:null,refunds:c.refunds})):[],
  fees:[],range,scope,now,
 };
 const summarize=(r:typeof range)=>summarizeCourseBusiness({...input,range:r});
 const data=summarize(range),comparisonWindow=businessComparisonRange(range,now),prior=comparisonWindow?summarize(comparisonWindow.range):null;
 const segments={visitors:data.visitors,trial:data.trial,newVisitors:data.newVisitors,oldVisitors:data.oldVisitors,newCard:data.newCard,renewal:data.renewal,converted:data.converted,unconverted:data.unconverted,tracked:data.tracked,returned:data.returned,notReturned:data.notReturned};
 const filteredRows=rows.filter(r=>r.date<=today&&(scope.view==='store'||matches(scope.view==='manager'?r.managerId:r.technicianId)));
 const actualVisits=visits.filter(v=>v.status==='COMPLETED'&&v.startsAt<=now&&(scope.view==='store'||matches(scope.view==='manager'?managerMap.get(v.customerId??''):v.technicianId)));
 const completedRows:BeautyTrendRow[]=actualVisits.map(v=>({date:toLocalDateStr(v.startsAt),technicianId:v.technicianId,reserved:0,completed:1,trial:0,revenue:0}));
 const trendMetric=(r:typeof range,monthly=false)=>beautyTrend(completedRows,r,monthly?'year':'current','completed','',createdDate,today).map(d=>{
  const startDate=monthly?d.date+'-01':d.date;
  const periodEnd=monthly?toLocalDateStr(monthRange(d.date).end):d.date;
  const summary=summarize({startDate,endDate:periodEnd<endDate?periodEnd:endDate});
  return {date:d.date,available:d.value!==null,attendance:summary.attendance,trial:summary.trial.length,newCard:summary.newCard.length,renewal:summary.renewal.length,...(finance?{revenue:filteredRows.filter(row=>row.date.slice(0,d.date.length)===d.date).reduce((n,v)=>n+v.revenue,0)}:{})};
 });
 return {pendingProfit:[],pendingFees:[],scope,range,staff:[...managers.map(m=>({...m,courseCoachEnabled:false})),...technicians.map(t=>({id:t.id,displayName:t.name,courseCoachEnabled:true,user:{role:'CUSTOMER' as const}}))],coverageStart:createdDate,effectiveEndDate:endDate,comparison:prior&&comparisonWindow?{...comparisonWindow,attendance:prior.attendance,trial:prior.trial.length,newCard:prior.newCard.length,renewal:prior.renewal.length,conversionRate:prior.conversionRate}:null,monthlyTrend:trendMetric({startDate:addTaiwanDuration(range.endDate.slice(0,7)+'-01',-11,'MONTH'),endDate:range.endDate},true),counts:Object.fromEntries(Object.entries(segments).map(([k,v])=>[k,v.length])) as CourseBusinessReport['counts'],segments:canCustomers?segments:null,retentionBase:data.retentionBase,retentionRate:data.retentionRate,retentionRange:data.retentionRange,eligibleTrials:data.eligibleTrials,conversionRate:data.conversionRate,sessions:data.sessions,hours:data.hours,attendance:data.attendance,fee:null,missingFees:0,profit:null,knownProfit:0,missingProfit:0,netRevenue:finance?filteredRows.filter(r=>r.date>=range.startDate&&r.date<=endDate).reduce((n,v)=>n+v.revenue,0):null,trend:trendMetric(range)};
}
