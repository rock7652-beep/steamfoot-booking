import {getCurrentUser} from '@/lib/session';
import {resolveBusinessScope} from '@/lib/course-business-analytics';
import {BusinessAnalyticsView} from '@/app/(dashboard)/dashboard/courses/business-analytics-view';
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
 const user=await getCurrentUser();if(!user)return null;
 const all=user.role==='OWNER'||user.role==='ADMIN';
 const ownPerson=query.perspective==='coach'?data.techs.find(t=>t.userId===user.id)?.id:user.staffId;
 let scope;try{scope=resolveBusinessScope(query,all,ownPerson);}catch{return <p role="alert">沒有檢視此分析對象的權限。</p>;}
 let range,bounds;try{range=courseAnalysisRange(query);bounds=beautyAnalysisBounds(range);}catch{return <p role="alert">請選擇有效且不超過一年的分析期間。</p>;}
 const effectiveEnd=new Date(Math.min(bounds.end.getTime(),Date.now()));
 const [store,services,payments,visits,rawCards,managers,attributions,refunds,customerAttributions]=await Promise.all([
  prisma.store.findUniqueOrThrow({where:{id:actor.storeId},select:{createdAt:true}}),
  beautyPrisma.$queryRaw<{date:Date;technicianId:string;managerId:string|null;reserved:bigint;completed:bigint;trial:bigint}[]>`SELECT timezone('Asia/Taipei',a."startsAt")::date AS date,a."technicianId",c."assignedStaffId" AS "managerId",count(*) FILTER (WHERE a.status<>'CANCELLED') AS reserved,count(*) FILTER (WHERE a.status='COMPLETED') AS completed,count(*) FILTER (WHERE a."isTrial" AND a.status<>'CANCELLED') AS trial FROM "BeautyAppointment" a LEFT JOIN "Customer" c ON c.id=a."customerId" AND c."storeId"=a."storeId" WHERE a."storeId"=${actor.storeId} AND a."startsAt">=${bounds.start} AND a."startsAt"<=${bounds.end} GROUP BY 1,2,3`,
  data.access.financeAccess?beautyPrisma.$queryRaw<{date:Date;technicianId:string|null;managerId:string|null;revenue:bigint}[]>`
   WITH attribution AS (SELECT DISTINCT ON (j->>'cardId') j->>'cardId' AS "cardId",j->>'revenueStaffId' AS "managerId" FROM (SELECT id,"createdAt",CASE WHEN body IS JSON OBJECT THEN body::jsonb ELSE '{}'::jsonb END AS j FROM "BeautyEvent" WHERE "storeId"=${actor.storeId} AND kind='ISSUE_CARD' AND status='AUDIT') e WHERE j->>'cardId' IS NOT NULL ORDER BY j->>'cardId',"createdAt",id)
   SELECT timezone('Asia/Taipei',p."createdAt")::date AS date,a."technicianId",CASE WHEN p."cardId" IS NOT NULL THEN t."managerId" ELSE c."assignedStaffId" END AS "managerId",sum(p.amount) AS revenue
   FROM "BeautyPayment" p LEFT JOIN "BeautyAppointment" a ON a.id=p."appointmentId" AND a."storeId"=p."storeId" LEFT JOIN "Customer" c ON c.id=a."customerId" AND c."storeId"=a."storeId" LEFT JOIN attribution t ON t."cardId"=p."cardId"
   WHERE p."storeId"=${actor.storeId} AND p.kind IN ('SALE','REFUND') AND p."createdAt">=${bounds.start} AND p."createdAt"<=${effectiveEnd} GROUP BY 1,2,3`:[],
  beautyPrisma.beautyAppointment.findMany({where:{storeId:actor.storeId,startsAt:{lte:effectiveEnd},status:'COMPLETED'},select:{id:true,customerId:true,personName:true,technicianId:true,status:true,isTrial:true,startsAt:true,endsAt:true}}),
  data.access.planAccess?beautyPrisma.beautyCard.findMany({where:{storeId:actor.storeId,createdAt:{lte:effectiveEnd}},select:{id:true,customerId:true,createdAt:true,paid:true}}):[],
  prisma.staff.findMany({where:{storeId:actor.storeId,user:{role:{not:"CUSTOMER"}}},select:{id:true,displayName:true,user:{select:{role:true}}}}),
  data.access.planAccess?beautyPrisma.$queryRaw<{cardId:string;managerId:string|null}[]>`SELECT DISTINCT ON (j->>'cardId') j->>'cardId' AS "cardId",j->>'revenueStaffId' AS "managerId" FROM (SELECT id,"createdAt",CASE WHEN body IS JSON OBJECT THEN body::jsonb ELSE '{}'::jsonb END AS j FROM "BeautyEvent" WHERE "storeId"=${actor.storeId} AND kind='ISSUE_CARD' AND status='AUDIT') e WHERE j->>'cardId' IS NOT NULL ORDER BY j->>'cardId',"createdAt",id`:[],
  data.access.planAccess?beautyPrisma.beautyPayment.findMany({where:{storeId:actor.storeId,kind:"REFUND",cardId:{not:null},createdAt:{lte:effectiveEnd}},select:{cardId:true,amount:true,createdAt:true}}):[],
  prisma.customer.findMany({where:{storeId:actor.storeId},select:{id:true,assignedStaffId:true}}),
 ]);
 const attribution=new Map(attributions.map(a=>[a.cardId,a.managerId]));
 const cards=rawCards.map(c=>({...c,revenueStaffId:attribution.get(c.id)??null,refunds:refunds.filter(r=>r.cardId===c.id).map(r=>({amount:-r.amount,createdAt:r.createdAt}))}));
 const rows:BeautyTrendRow[]=[...services.map(r=>({date:toLocalDateStr(r.date),technicianId:r.technicianId,managerId:r.managerId,reserved:Number(r.reserved),completed:Number(r.completed),trial:Number(r.trial),revenue:0})),...payments.map(r=>({date:toLocalDateStr(r.date),technicianId:r.technicianId,managerId:r.managerId,reserved:0,completed:0,trial:0,revenue:Number(r.revenue)}))];
 const {view,person}=scope;
 if(!['store','coach','manager'].includes(view)||(view==='coach'&&person!=='all'&&!data.techs.some(t=>t.id===person))||(view==='manager'&&!['all','unassigned'].includes(person)&&!managers.some(m=>m.id===person)))return <p role="alert">分析對象不正確，請重新選擇本店人員。</p>;
 const report=beautyBusinessReport({visits,cards,customers:customerAttributions.map(c=>({id:c.id,name:data.customers.find(p=>p.id===c.id)?.name??'',assignedStaff:c.assignedStaffId?{id:c.assignedStaffId}:null})),technicians:data.techs,managers,rows,range,scope,createdDate:toLocalDateStr(store.createdAt),canCustomers:data.access.customerAccess,canPlans:data.access.planAccess,finance:data.access.financeAccess});
 if(!all)report.staff=report.staff.filter(s=>s.id===ownPerson);
 return <BusinessAnalyticsView key={`${range.startDate}:${range.endDate}:${view}:${person}`} data={report} all={all} staffId={ownPerson} beauty plans={data.access.planAccess} periodControls={<ReportDateRange compact preserveQuery activePreset={query.startDate?'custom':query.preset??'month'} {...range}/>} statisticsNotes={<details className="text-sm text-earth-600"><summary className="min-h-11 cursor-pointer py-3">統計方式與歸屬</summary><div className="space-y-2 pb-3"><p>來客人次依實際完成服務；取消、未到及僅收款均不算完成。同一人多次服務可累計人次，未建檔同行者不依姓名猜測歸戶。</p><p>新購與續購沿用原共用統計核心，依首次付費、退款與購買期間計算，家人共用不重複成交。服務依顧客目前所屬店長；方案成交依購買當時歸屬快照，舊紀錄沒有快照則列未歸屬，不使用收款人或現在歸屬推測。</p><p>體驗轉換與回流沿用運動共用統計核心：只計購買前已完成體驗的同批顧客，回流依對照期間核對是否再次完成。收退款依入帳日，服務依預約日。</p><p>技師收款只計本人服務分項；沒有檢視權限的金額與顧客名單不提供。拆帳明細維持營運入口，不套用運動授課費公式。</p></div></details>}/>;
}
