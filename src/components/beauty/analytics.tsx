import {beautyBusinessMetrics} from '@/lib/beauty/business-metrics';
import {BusinessAnalyticsView} from '@/app/(dashboard)/dashboard/courses/business-analytics-view';
import {BusinessMetric} from '@/components/admin/business-metric';
import {beautyBusinessReport} from '@/lib/beauty/business-report';
import ReportDateRange from '@/components/report-date-range';
import {beautyPrisma} from '@/lib/beauty-db';
import {prisma} from '@/lib/db';
import {beautyManager} from '@/server/beauty/access';
import {courseAnalysisRange} from '@/lib/course-analytics';
import {beautyAnalysisBounds,type BeautyTrendRow} from '@/lib/beauty/analytics';
import {toLocalDateStr} from '@/lib/date-utils';
import type {BeautyDashboardData} from '@/server/beauty/queries';
export async function BeautyAnalytics({data,query}:{data:BeautyDashboardData;query:{preset?:string;startDate?:string;endDate?:string;month?:string;perspective?:string;person?:string}}){
 const actor=await beautyManager('report.read');
 let range,bounds;try{range=courseAnalysisRange(query);bounds=beautyAnalysisBounds(range);}catch{return <p role="alert">請選擇有效且不超過一年的分析期間。</p>;}
 const effectiveEnd=new Date(Math.min(bounds.end.getTime(),Date.now()));
 const [store,services,payments,visits,cards]=await Promise.all([
  prisma.store.findUniqueOrThrow({where:{id:actor.storeId},select:{createdAt:true}}),
  beautyPrisma.$queryRaw<{date:Date;technicianId:string;reserved:bigint;completed:bigint;trial:bigint}[]>`SELECT timezone('Asia/Taipei',"startsAt")::date AS date,"technicianId",count(*) FILTER (WHERE status<>'CANCELLED') AS reserved,count(*) FILTER (WHERE status='COMPLETED') AS completed,count(*) FILTER (WHERE "isTrial" AND status<>'CANCELLED') AS trial FROM "BeautyAppointment" WHERE "storeId"=${actor.storeId} AND "startsAt">=${bounds.start} AND "startsAt"<=${bounds.end} GROUP BY 1,2`,
  data.access.financeAccess?beautyPrisma.$queryRaw<{date:Date;technicianId:string|null;revenue:bigint}[]>`SELECT timezone('Asia/Taipei',p."createdAt")::date AS date,a."technicianId",sum(p.amount) AS revenue FROM "BeautyPayment" p LEFT JOIN "BeautyAppointment" a ON a.id=p."appointmentId" AND a."storeId"=p."storeId" WHERE p."storeId"=${actor.storeId} AND p.kind IN ('SALE','REFUND') AND p."createdAt">=${bounds.start} AND p."createdAt"<=${effectiveEnd} GROUP BY 1,2`:[],
  beautyPrisma.beautyAppointment.findMany({where:{storeId:actor.storeId,startsAt:{lte:effectiveEnd},status:'COMPLETED'},select:{id:true,customerId:true,personName:true,technicianId:true,status:true,isTrial:true,startsAt:true,endsAt:true}}),
  data.access.planAccess?beautyPrisma.beautyCard.findMany({where:{storeId:actor.storeId,createdAt:{lte:effectiveEnd}},select:{id:true,customerId:true,createdAt:true}}):[],
 ]);
 const business=data.access.planAccess?beautyBusinessMetrics(visits,cards,range):undefined;
 const rows:BeautyTrendRow[]=[...services.map(r=>({date:toLocalDateStr(r.date),technicianId:r.technicianId,reserved:Number(r.reserved),completed:Number(r.completed),trial:Number(r.trial),revenue:0})),...payments.map(r=>({date:toLocalDateStr(r.date),technicianId:r.technicianId,reserved:0,completed:0,trial:0,revenue:Number(r.revenue)})),...(business?.sales??[]).map(s=>({...s,technicianId:null,reserved:0,completed:0,trial:0,revenue:0}))];
 const view=query.perspective??'store',person=view==='store'?'all':query.person??'all';
 if(!['store','coach'].includes(view)||(view==='coach'&&person!=='all'&&!data.techs.some(t=>t.id===person)))return <p role="alert">分析對象不正確，請重新選擇本店技師。</p>;
 const report=beautyBusinessReport({visits,cards,customers:data.customers,technicians:data.techs,rows,range,scope:{view:view as 'store'|'coach',person},createdDate:toLocalDateStr(store.createdAt),canCustomers:data.access.customerAccess,canPlans:data.access.planAccess,finance:data.access.financeAccess});
 return <BusinessAnalyticsView key={`${range.startDate}:${range.endDate}:${view}:${person}`} data={report} all beauty plans={data.access.planAccess} periodControls={<ReportDateRange compact preserveQuery activePreset={query.startDate?'custom':query.preset??'month'} {...range}/>} supplementalMetrics={<div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><BusinessMetric label="預約人次" value={String(rows.filter(r=>r.date>=range.startDate&&r.date<=range.endDate&&(view==='store'||person==='all'||r.technicianId===person)).reduce((n,r)=>n+r.reserved,0))}/>{view==='store'&&data.access.planAccess&&data.access.customerAccess&&<BusinessMetric label="有效方案" value={String(data.cards.filter(c=>!c.closedAt&&Date.parse(c.expiresAt)>data.now).length)} note="目前未到期、未結清的方案"/>}</div>} statisticsNotes={<details className="text-sm text-earth-600"><summary className="min-h-11 cursor-pointer py-3">統計方式與歸屬</summary><div className="space-y-2 pb-3"><p>來客人次依實際完成服務；取消、未到及僅收款均不算完成。同一人多次服務可累計人次，未建檔同行者不依姓名猜測歸戶。</p><p>新購與續購依購買人及開卡日統計，家人共用不重複計算；人數名單按人去重，趨勢的新購按開卡筆數。技師依實際服務分項統計，方案銷售只歸全店，不推定為某技師成交。</p><p>體驗轉換依首次完成體驗後、期間結束前開卡計算。回流以期前曾完成服務者，核對本期是否再次完成。收退款依入帳日，服務依預約日。</p><p>技師收款只計本人服務分項；沒有檢視權限的金額與顧客名單不提供。拆帳明細維持營運入口，不套用運動授課費公式。</p></div></details>}/>;
}
