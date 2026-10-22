import {toLocalDateStr} from '@/lib/date-utils';
type Visit={customerId:string|null;status:string;isTrial:boolean;startsAt:Date};
type Card={id:string;customerId:string;createdAt:Date};
/** Buyer-based plan counts; actual completed trials/visits, never payment-as-attendance. */
export function beautyBusinessMetrics(visits:Visit[],cards:Card[],range:{startDate:string;endDate:string}){
 const within=(d:Date)=>{const day=toLocalDateStr(d);return day>=range.startDate&&day<=range.endDate;};
 const sorted=[...cards].sort((a,b)=>+a.createdAt-+b.createdAt||a.id.localeCompare(b.id)),seen=new Set<string>();
 const sales=sorted.map(card=>{const renewal=seen.has(card.customerId);seen.add(card.customerId);return {...card,renewal};});
 const completed=visits.filter(v=>v.status==='COMPLETED'&&v.customerId),before=new Set(completed.filter(v=>toLocalDateStr(v.startsAt)<range.startDate).map(v=>v.customerId!)),current=new Set(completed.filter(v=>within(v.startsAt)).map(v=>v.customerId!));
 const firstTrials=new Map<string,Date>();for(const v of [...completed].sort((a,b)=>+a.startsAt-+b.startsAt)){if(v.isTrial&&!firstTrials.has(v.customerId!))firstTrials.set(v.customerId!,v.startsAt);}
 const trials=[...firstTrials].filter(([,at])=>within(at));
 const converted=trials.filter(([id,at])=>sales.some(s=>s.customerId===id&&s.createdAt>=at&&toLocalDateStr(s.createdAt)<=range.endDate)).length;
 const returned=[...before].filter(id=>current.has(id)).length;
 return {newCard:sales.filter(s=>!s.renewal&&within(s.createdAt)).length,renewal:sales.filter(s=>s.renewal&&within(s.createdAt)).length,eligibleTrials:trials.length,converted,conversionRate:trials.length?converted/trials.length*100:null,retentionBase:before.size,returned,notReturned:before.size-returned,retentionRate:before.size?returned/before.size*100:null,sales:sales.map(s=>({date:toLocalDateStr(s.createdAt),newCard:s.renewal?0:1,renewal:s.renewal?1:0}))};
}
