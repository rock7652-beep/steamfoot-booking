import 'server-only';
import {beautyManager} from './access';
import {getBeautyRevenueReport} from '@/server/queries/beauty-revenue-report';
import {beautyPrisma} from '@/lib/beauty-db';
import {checkPermission} from '@/lib/permissions';
import {requireSession} from '@/lib/session';
import {hasStoreFeature,requireStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {dayRange} from '@/lib/date-utils';
import {AppError} from '@/lib/errors';
import {beautyAnalysisBounds} from '@/lib/beauty/analytics';
import {beautyRevenueBreakdown,beautyTechnicianBreakdown} from '@/lib/beauty/revenue-breakdown';
import {z} from 'zod';
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s);
export async function readBeautyRevenueBreakdown(expectedStoreId:string,input:{from:string;to:string;includeTechnicians?:boolean}){
 const a=await beautyManager('report.read');await beautyManager('transaction.read');
 if(a.storeId!==expectedStoreId)throw new AppError('FORBIDDEN','店家已切換，請重新開啟營運');
 await requireStoreFeature(a.storeId,FEATURES.BASIC_REPORTS);await requireStoreFeature(a.storeId,FEATURES.TRANSACTION_MANAGEMENT);
 const {from,to}=z.object({from:date,to:date}).parse(input);if(from>to)throw new AppError('VALIDATION','開始日期不能晚於結束日期');beautyAnalysisBounds({startDate:from,endDate:to});
 const user=await requireSession();
 const canFees=input.includeTechnicians!==false&&await checkPermission(user.role,user.staffId,'teacher.compensation.read')&&await checkPermission(user.role,user.staffId,'teacher.settlement.read')&&await hasStoreFeature(a.storeId,FEATURES.SERVICE_FEE_CALCULATOR);
 const [report,technicians]=await Promise.all([
  getBeautyRevenueReport(a.storeId,{startDate:from,endDate:to,storeFilter:{storeId:a.storeId}},{customers:false,includeFirstPurchase:false}),
  canFees?beautyPrisma.$transaction(async tx=>{
   const services=await tx.beautyAppointment.findMany({where:{storeId:a.storeId,status:'COMPLETED',startsAt:{gte:dayRange(from).start,lte:dayRange(to).end}},select:{id:true,technicianId:true,fee:true}});
   if(!services.length)return [];
   const [payments,names]=await Promise.all([
    tx.beautyPayment.findMany({where:{storeId:a.storeId,appointmentId:{in:services.map(s=>s.id)},kind:{in:['FEE','FEE_VOID']}},select:{appointmentId:true,amount:true}}),
    tx.beautyTechnician.findMany({where:{storeId:a.storeId,id:{in:[...new Set(services.map(s=>s.technicianId))]}},select:{id:true,name:true}}),
   ]);
   return beautyTechnicianBreakdown(services,payments,names);
  },{isolationLevel:'RepeatableRead',timeout:15000}):Promise.resolve(null),
 ]);
 return {storeId:a.storeId,from,to,storeName:report.summary[0]?.storeName??'',...beautyRevenueBreakdown(report.data),technicians};
}
export type BeautyRevenueBreakdownData=Awaited<ReturnType<typeof readBeautyRevenueBreakdown>>;
