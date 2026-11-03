import "server-only";
import type {Prisma} from "../../../generated/course-client";
import {musicNativeWorkflowEnabled} from "./music-native-workflow";
import {AppError} from "@/lib/errors";
import {musicReceiptAmount,musicPaymentDate} from "@/lib/music-tuition";
import {toLocalDateStr} from "@/lib/date-utils";
import {lockCashDay} from "./cash-day";
export type MusicTuition={purchaseId:string;due:number;discountTeacherFee:boolean;checkoutFingerprint:string};
export type MusicReceipt={id:string;purchaseId:string;amount:number;paidAt:Date;method:string;lastFour:string|null;requestKey:string;actorUserId:string;createdAt:Date};
type Reader=Pick<Prisma.TransactionClient,"$queryRaw">;
export async function readMusicTuition(tx:Reader,storeId:string,ids:string[]) {
 if(!musicNativeWorkflowEnabled(storeId)||!ids.length)return new Map<string,MusicTuition>();
 const rows=await tx.$queryRaw<MusicTuition[]>`SELECT * FROM "CourseMusicTuition" WHERE "storeId"=${storeId} AND "purchaseId"=ANY(${ids}::text[])`;
 return new Map(rows.map(r=>[r.purchaseId,r]));
}
export async function readMusicReceipts(tx:Reader,storeId:string,ids:string[]) {
 if(!musicNativeWorkflowEnabled(storeId)||!ids.length)return [] as MusicReceipt[];
 return tx.$queryRaw<MusicReceipt[]>`SELECT * FROM "CourseMusicReceipt" WHERE "storeId"=${storeId} AND "purchaseId"=ANY(${ids}::text[]) ORDER BY "paidAt", "createdAt", id`;
}
/** Caller holds the store lock and checks transaction.create. Never grants quota. */
export async function receiveMusicTuition(tx:Prisma.TransactionClient,actor:{storeId:string;userId:string},input:{purchaseId:string;amount:number;paymentDate:string;method:string;lastFour:string;requestKey:string;expectedReceived:number;initial?:boolean}) {
 const {storeId,userId}=actor;
 if(!musicNativeWorkflowEnabled(storeId))throw new AppError("FORBIDDEN","此店尚未啟用分次收款");
 const paidAt=musicPaymentDate(input.paymentDate);
 const lastFour=input.method==="BANK_TRANSFER"?input.lastFour:null;
 if(!["CASH","BANK_TRANSFER","CARD","OTHER"].includes(input.method)||(input.method==="BANK_TRANSFER"&&!/^\d{4}$/.test(lastFour??"")))throw new AppError("VALIDATION","請核對付款方式與轉帳後四碼");
 const previous=await tx.$queryRaw<MusicReceipt[]>`SELECT * FROM "CourseMusicReceipt" WHERE "storeId"=${storeId} AND "requestKey"=${input.requestKey}`;
 if(previous[0]){const p=previous[0];if(p.purchaseId!==input.purchaseId||p.amount!==input.amount||+p.paidAt!==+paidAt||p.method!==input.method||p.lastFour!==lastFour)throw new AppError("CONFLICT","收款請求已使用，請重新開啟核對");return p;}
 const order=await tx.coursePurchase.findFirst({where:{storeId,id:input.purchaseId}});
 const terms=(await readMusicTuition(tx,storeId,[input.purchaseId])).get(input.purchaseId);
 if(!order||!terms||order.status!=="CONFIRMED"||order.voidedAt)throw new AppError("BUSINESS_RULE","此購課紀錄無法補繳，請核對狀態");
 const receipts=await readMusicReceipts(tx,storeId,[order.id]);
 const received=receipts.reduce((n,r)=>n+r.amount,0);
 const initial=input.initial===true&&received===0&&input.expectedReceived===0&&order.price===input.amount;
 if((!initial&&received!==order.price)||received!==input.expectedReceived)throw new AppError("CONFLICT","收款金額已更新，請重新核對後補繳");
 if(input.amount<=0)throw new AppError("VALIDATION","補繳金額須大於零");
 musicReceiptAmount(terms.due-received,input.amount);
 const day=new Date(toLocalDateStr(paidAt)+"T00:00:00Z");
 if(input.method==="CASH")await lockCashDay(tx,storeId,day,{requireOpen:true});
 const id=crypto.randomUUID();
 await tx.$executeRaw`INSERT INTO "CourseMusicReceipt" (id,"storeId","purchaseId",amount,"paidAt",method,"lastFour","requestKey","actorUserId") VALUES (${id},${storeId},${order.id},${input.amount},${paidAt},${input.method},${lastFour},${input.requestKey},${userId})`;
 await tx.$executeRaw`INSERT INTO "CashbookEntry" (id,"storeId","entryDate",type,"paymentMethod",category,amount,note,"createdByUserId","updatedAt") VALUES (${"music-receipt:"+id},${storeId},${day},'INCOME',${input.method==="CASH"?"CASH":"OTHER"}::"CashbookPaymentMethod",'課程方案',${input.amount},${order.name+" / 分次收款"},${userId},NOW())`;
 await tx.coursePurchase.update({where:{id:order.id},data:{price:received+input.amount,storeCostSnapshot:received+input.amount}});
 await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","targetType","targetId",action,"afterJson","createdAt") VALUES (${crypto.randomUUID()},${userId},'CoursePurchase',${order.id},'MUSIC_RECEIPT',${JSON.stringify({receiptId:id,amount:input.amount,paymentDate:input.paymentDate,method:input.method,quotaAdded:0})}::jsonb,NOW())`;
 return {id};
}
