import {beautyCareCardMatches} from '@/lib/beauty/care';
import {CareFilters} from '@/app/(dashboard)/dashboard/growth/_components/care-filters';
import type {CareReason} from '@/lib/customer-care-lifecycle';
import {CareWorkspaceServer} from '@/app/(dashboard)/dashboard/growth/_components/care-workspace-server';
import type {CareSectionData} from '@/app/(dashboard)/dashboard/growth/_components/care-workspace';
import type {CareItem} from '@/app/(dashboard)/dashboard/growth/_components/care-section';
import {beautyPrisma} from '@/lib/beauty-db';
import {beautyManager} from '@/server/beauty/access';
import {toLocalDateStr,formatTWDateTime} from '@/lib/date-utils';
import type {BeautyDashboardData} from '@/server/beauty/queries';
export async function readBeautyCareSections(data:BeautyDashboardData){
 const a=await beautyManager('customer.read');
 const [visits,sales,trials]=await Promise.all([
 beautyPrisma.beautyAppointment.groupBy({by:['customerId'],where:{storeId:a.storeId,customerId:{in:data.customers.map(c=>c.id)},status:'COMPLETED',startsAt:{lte:new Date()}},_max:{startsAt:true}}),
 data.access.planAccess?beautyPrisma.beautyPayment.groupBy({by:['cardId'],where:{storeId:a.storeId,cardId:{in:data.cards.map(c=>c.id)},kind:{in:['SALE','REFUND']}},_sum:{amount:true}}):[],
 data.access.planAccess?beautyPrisma.beautyAppointment.findMany({where:{storeId:a.storeId,customerId:{in:data.customers.map(c=>c.id)},isTrial:true,status:'COMPLETED',startsAt:{lte:new Date()}},distinct:['customerId'],orderBy:{startsAt:'desc'},select:{customerId:true,startsAt:true,serviceName:true}}):[],
 ]);
 const base=(id:string):CareItem=>{const c=data.customers.find(c=>c.id===id)!;return {customerId:c.id,name:c.name,phoneLabel:c.phone,staffLabel:'所屬店長',staffName:c.assignedStaff?.displayName??null,lastFollowUpText:null,reason:'',meta:null,script:'您好，想關心您最近的服務體驗，需要安排下次時間可以與我們聯絡。',module:'beauty'};};
 const cardItems=(expiring:boolean)=>data.customers.flatMap(c=>{const cards=data.cards.filter(k=>k.memberIds.includes(c.id)&&beautyCareCardMatches(k,data.plans.find(p=>p.id===k.planId),data.now,expiring?'expiring':'low'));return cards.length?[{...base(c.id),reason:expiring?'方案即將到期':'方案剩餘次數不足',meta:cards.map(k=>`${k.name} · 可用${Math.max(0,k.remaining-k.held)}次 · ${toLocalDateStr(new Date(k.expiresAt))}到期`).join('；')}]:[];});
 const paid=new Set(sales.filter(s=>(s._sum.amount??0)>0).flatMap(s=>data.cards.filter(c=>c.id===s.cardId).map(c=>c.customerId)));
 const sections:CareSectionData[]=[{reason:'birthday',title:'本月生日',description:'本月生日祝福',emptyText:'本月沒有待祝福顧客。',items:data.customers.filter(c=>c.birthday&&c.birthday.toISOString().slice(5,7)===data.month.slice(5,7)).map(c=>({...base(c.id),reason:'本月生日',meta:c.birthday!.toISOString().slice(5,10)}))},{reason:'inactive',title:'好久不見',description:'超過30天未完成服務，仍有有效方案',emptyText:'目前沒有需要回店關懷的顧客。',items:visits.flatMap(v=>v.customerId&&v._max.startsAt&&+v._max.startsAt<data.now-30*86400000&&data.cards.some(k=>k.memberIds.includes(v.customerId!)&&!k.closedAt&&k.remaining>0&&Date.parse(k.expiresAt)>data.now)?[{...base(v.customerId),reason:'超過30天未完成服務',meta:'最近服務 '+formatTWDateTime(v._max.startsAt)}]:[])}];
 if(data.access.planAccess)sections.push({reason:'low',title:'額度快用完',description:'依各方案設定的低可用次數門檻',emptyText:'目前沒有低次數提醒。',items:cardItems(false)},{reason:'expiring',title:'方案快到期',description:'未到期且14天內到期的方案',emptyText:'目前沒有到期提醒。',items:cardItems(true)},{reason:'trial',title:'體驗未購買方案',description:'實際完成體驗且沒有付費方案',emptyText:'目前沒有待關懷體驗顧客。',items:trials.flatMap(t=>t.customerId&&!paid.has(t.customerId)?[{...base(t.customerId),reason:'體驗後尚未購買方案',meta:t.serviceName+' · '+formatTWDateTime(t.startsAt)}]:[])});
 return sections;
}
export async function BeautyCare({data,readOnly,selected}:{data:BeautyDashboardData;readOnly:boolean;selected?:CareReason|null}){
 const sections=await readBeautyCareSections(data);
 return <><CareFilters reasons={sections.map(section=>section.reason)} month={data.month} selected={selected??null} counts={Object.fromEntries(sections.map(section=>[section.reason,section.items.length]))} baseHref="/dashboard/beauty" query={{tab:'顧客經營'}}/><CareWorkspaceServer storeId={data.storeId} module="beauty" month={data.month} readOnly={readOnly} canFollowUp={!!data.manage.customerEdit} canBook={data.access.writeAccess} selected={selected} sections={sections}/></>;
}
