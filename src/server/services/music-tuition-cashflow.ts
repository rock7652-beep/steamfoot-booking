import "server-only";
import type {Prisma} from "../../../generated/course-client";
import {musicDataSeparationEnabled} from "./music-data-scope";
import {musicPurchaseWhere} from "./music-finance-scope";
import type {MusicReceipt} from "./music-tuition";
/** Cashflow uses payment dates, never the date a quota card was issued. */
export async function coursePurchaseCashflow(tx:Prisma.TransactionClient,storeId:string,range:{gte:Date;lte:Date},scope?:string|null){
 const legacy=await tx.coursePurchase.findMany({where:{storeId,...musicPurchaseWhere(storeId,scope),status:{in:["CONFIRMED","REFUNDED"]},confirmedAt:range}});
 if(!musicDataSeparationEnabled(storeId))return legacy.map(p=>({...p,cashflowId:p.id}));
 const [agreements,receipts]=await Promise.all([
  tx.$queryRaw<Array<{purchaseId:string}>>`SELECT "purchaseId" FROM "CourseMusicTuition" WHERE "storeId"=${storeId}`,
  tx.$queryRaw<MusicReceipt[]>`SELECT * FROM "CourseMusicReceipt" WHERE "storeId"=${storeId} AND "paidAt" BETWEEN ${range.gte} AND ${range.lte}`,
 ]);
 const orders=await tx.coursePurchase.findMany({where:{storeId,AND:[musicPurchaseWhere(storeId,scope),{id:{in:[...new Set(receipts.map(r=>r.purchaseId))]}}],status:{in:["CONFIRMED","REFUNDED"]}}});
 const map=new Map(orders.map(p=>[p.id,p]));const ledgerIds=new Set(agreements.map(p=>p.purchaseId));
 return [...legacy.filter(p=>!ledgerIds.has(p.id)).map(p=>({...p,cashflowId:p.id})),...receipts.flatMap(r=>{const p=map.get(r.purchaseId);return p?[{...p,price:r.amount,confirmedAt:r.paidAt,paymentMethod:r.method,transferLastFour:r.lastFour,confirmedBy:r.actorUserId,cashflowId:r.id}]:[];})];
}
