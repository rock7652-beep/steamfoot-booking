import 'server-only';
import {createHash} from 'node:crypto';
import type {Prisma} from '../../../generated/course-client';
import {coursePurchaseCostSnapshot,courseFeeCostVersion,type CostPlan} from '@/lib/course-cost-review';
/** Inside the purchase transaction. Never reconstruct historical cost from today's plan. */
export async function recordCoursePurchaseCost(tx:Pick<Prisma.TransactionClient,'$executeRaw'>,actor:{storeId:string;userId:string},purchaseId:string,plan:CostPlan,quote:{price:number;points:number}){
 const snapshot=coursePurchaseCostSnapshot.parse({version:1,feeVersion:courseFeeCostVersion(plan),planId:plan.id,storeCost:plan.storeCost,basePrice:plan.price,quotedPrice:quote.price,basePoints:plan.points,purchasedPoints:quote.points});
 const id='course-cost:'+createHash('sha256').update(JSON.stringify([actor.storeId,purchaseId])).digest('hex');
 await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","storeId","targetType","targetId",action,"afterJson","createdAt") VALUES (${id},${actor.userId},${actor.storeId},'CoursePurchase',${purchaseId},'COURSE_COST_QUOTE',${JSON.stringify(snapshot)}::jsonb,NOW()) ON CONFLICT(id) DO NOTHING`;
}
