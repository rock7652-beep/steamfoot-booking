import {beautyBusinessMetrics} from '@/lib/beauty/business-metrics';
import {BeautyAnalyticsWorkspace} from './analytics-workspace';
import {beautyPrisma} from '@/lib/beauty-db';
import {prisma} from '@/lib/db';
import {beautyManager} from '@/server/beauty/access';
import {courseAnalysisRange} from '@/lib/course-analytics';
import {beautyAnalysisBounds,type BeautyTrendRow} from '@/lib/beauty/analytics';
import {dayRange,toLocalDateStr} from '@/lib/date-utils';
import type {BeautyDashboardData} from '@/server/beauty/queries';
export async function BeautyAnalytics({data,query}:{data:BeautyDashboardData;query:{preset?:string;startDate?:string;endDate?:string;month?:string}}){
 const actor=await beautyManager('report.read');
 let range,bounds;try{range=courseAnalysisRange(query);bounds=beautyAnalysisBounds(range);}catch{return <p role="alert">請選擇有效且不超過一年的分析期間。</p>;}
 const [store,services,payments,details,visits,cards]=await Promise.all([
  prisma.store.findUniqueOrThrow({where:{id:actor.storeId},select:{createdAt:true}}),
  beautyPrisma.$queryRaw<{date:Date;technicianId:string;reserved:bigint;completed:bigint;trial:bigint}[]>`SELECT timezone('Asia/Taipei',"startsAt")::date AS date,"technicianId",count(*) FILTER (WHERE status<>'CANCELLED') AS reserved,count(*) FILTER (WHERE status='COMPLETED') AS completed,count(*) FILTER (WHERE "isTrial" AND status<>'CANCELLED') AS trial FROM "BeautyAppointment" WHERE "storeId"=${actor.storeId} AND "startsAt">=${bounds.start} AND "startsAt"<=${bounds.end} GROUP BY 1,2`,
  data.access.financeAccess?beautyPrisma.$queryRaw<{date:Date;technicianId:string|null;revenue:bigint}[]>`SELECT timezone('Asia/Taipei',p."createdAt")::date AS date,a."technicianId",sum(p.amount) AS revenue FROM "BeautyPayment" p LEFT JOIN "BeautyAppointment" a ON a.id=p."appointmentId" AND a."storeId"=p."storeId" WHERE p."storeId"=${actor.storeId} AND p.kind IN ('SALE','REFUND') AND p."createdAt">=${bounds.start} AND p."createdAt"<=${bounds.end} GROUP BY 1,2`:[],
  data.access.customerAccess?beautyPrisma.beautyAppointment.findMany({where:{storeId:actor.storeId,startsAt:{gte:dayRange(range.startDate).start,lte:dayRange(range.endDate).end}},select:{id:true,customerId:true,personName:true,serviceName:true,technicianId:true,status:true,isTrial:true,startsAt:true},orderBy:{startsAt:'desc'},take:200}):[],
  beautyPrisma.beautyAppointment.findMany({where:{storeId:actor.storeId,startsAt:{lte:bounds.end},status:'COMPLETED'},select:{customerId:true,status:true,isTrial:true,startsAt:true}}),
  data.access.planAccess?beautyPrisma.beautyCard.findMany({where:{storeId:actor.storeId,createdAt:{lte:bounds.end}},select:{id:true,customerId:true,createdAt:true}}):[],
 ]);
 const business=data.access.planAccess?beautyBusinessMetrics(visits,cards,range):undefined;
 const rows:BeautyTrendRow[]=[...services.map(r=>({date:toLocalDateStr(r.date),technicianId:r.technicianId,reserved:Number(r.reserved),completed:Number(r.completed),trial:Number(r.trial),revenue:0})),...payments.map(r=>({date:toLocalDateStr(r.date),technicianId:r.technicianId,reserved:0,completed:0,trial:0,revenue:Number(r.revenue)})),...(business?.sales??[]).map(s=>({...s,technicianId:null,reserved:0,completed:0,trial:0,revenue:0}))];
 return <BeautyAnalyticsWorkspace business={business} range={range} preset={query.startDate?'custom':query.preset??'month'} createdDate={toLocalDateStr(store.createdAt)} rows={rows} technicians={data.techs.map(t=>({id:t.id,name:t.name}))} activeCards={data.access.planAccess&&data.access.customerAccess?data.cards.filter(c=>!c.closedAt&&Date.parse(c.expiresAt)>data.now).length:undefined} finance={data.access.financeAccess} canCustomers={data.access.customerAccess} details={details.map(r=>({...r,startsAt:r.startsAt.toISOString()}))}/>;
}
