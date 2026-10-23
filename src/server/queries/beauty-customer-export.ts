import 'server-only';
import {requireStoreFeature,hasStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {prisma} from '@/lib/db';
import {beautyPrisma} from '@/lib/beauty-db';
import {requireBeauty} from '@/server/beauty/access';
import {customerExportCsv,type CustomerExportAttendance} from '@/lib/customer-export-csv';
/** Called only after the export route authorizes the active store and each data scope. */
export async function getBeautyCustomerCsv(storeId:string,access:{cards:boolean;bookings:boolean}){
 await requireBeauty(storeId);await requireStoreFeature(storeId,FEATURES.CUSTOMER_MANAGEMENT);
 access={...access,cards:access.cards&&await hasStoreFeature(storeId,FEATURES.PLAN_MANAGEMENT)};
 const customers=await prisma.customer.findMany({where:{storeId,mergedIntoCustomerId:null},select:{id:true,name:true,phone:true,email:true,lineName:true,customerStage:true,address:true,notes:true,emergencyContactName:true,emergencyContactPhone:true,createdAt:true,assignedStaff:{select:{storeId:true,displayName:true}}},orderBy:[{name:'asc'},{id:'asc'}]});
 const cards=access.cards?await beautyPrisma.$queryRaw<Array<{id:string;name:string;remaining:number;expiresAt:Date;memberIds:string[];held:bigint}>>`SELECT c.id,c.name,c.remaining,c."expiresAt",c."memberIds",COUNT(b.id) AS held FROM "BeautyCard" c LEFT JOIN "BeautyAppointment" b ON b."storeId"=c."storeId" AND b."cardId"=c.id AND b.status='RESERVED' WHERE c."storeId"=${storeId} AND c."closedAt" IS NULL GROUP BY c.id ORDER BY c."expiresAt"`:[];
 const bookings=access.bookings?await beautyPrisma.$queryRaw<CustomerExportAttendance[]>`SELECT "customerId",COUNT(*) AS participations,COUNT(*) FILTER (WHERE status='COMPLETED') AS completed,MAX("startsAt") FILTER (WHERE status='COMPLETED') AS "lastVisitAt" FROM "BeautyAppointment" WHERE "storeId"=${storeId} AND status<>'CANCELLED' AND "customerId" IS NOT NULL GROUP BY "customerId"`:[];
 return customerExportCsv(storeId,access,customers,cards.map(c=>({nameSnapshot:c.name,unit:'SESSION',remaining:c.remaining,expiresAt:c.expiresAt,members:c.memberIds.map(customerId=>({customerId})),bookings:[{pointCost:Number(c.held)}]})),bookings,true);
}
