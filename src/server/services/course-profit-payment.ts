import "server-only";
import type { Prisma } from "../../../generated/course-client";
import { AppError } from "@/lib/errors";
import { toLocalDateStr } from "@/lib/date-utils";
import { profitPaymentInput } from "@/lib/course-monthly-settlement";
import { courseFeeVoidInput } from "@/lib/course-fee-payment";
import { readCourseMonthlySettlement } from "./course-monthly-settlement";
import { lockCourseCashDay } from "./course-assignment-checkout";
type Actor={storeId:string;userId:string};
/** Caller holds the course store lock and checks owner, feature, cashbook permission and subscription. */
export async function recordCourseProfitPayment(tx:Prisma.TransactionClient,actor:Actor,input:unknown){
 const d=profitPaymentInput.parse(input),{storeId,userId}=actor;
 const previous=await tx.$queryRaw<Array<{purchaseId:string;amount:number;method:string;note:string;voidedAt:Date|null}>>`SELECT "purchaseId",amount,method,note,"voidedAt" FROM "CourseProfitPayment" WHERE "storeId"=${storeId} AND "requestKey"=${d.requestKey}`;
 if(previous[0]){const p=previous[0];if(p.voidedAt||p.purchaseId!==d.purchaseId||p.amount!==d.amount||p.method!==d.method||p.note!==d.note)throw new AppError("CONFLICT","付款請求已使用，請重新核對");return;}
 const report=await readCourseMonthlySettlement(tx,storeId,d.month);
 if(report.revisions[0]?.fingerprint!==report.fingerprint)throw new AppError("CONFLICT","請先確認目前月結金額，再登錄付款");
 const line=report.lines.find(l=>l.kind==="PROFIT"&&l.id===d.purchaseId);
 if(!line||line.issue||line.amount===null||!line.staffId)throw new AppError("BUSINESS_RULE","此筆利潤需先核對");
 const remaining=line.amount-line.paid;
 if(remaining!==d.expectedRemaining||d.amount>remaining)throw new AppError("CONFLICT","待付金額已變更，請重新整理核對");
 const day=new Date(toLocalDateStr()+"T00:00:00Z");
 if(d.method==="CASH")await lockCourseCashDay(tx,storeId,day);
 const id=crypto.randomUUID();
 await tx.$executeRaw`INSERT INTO "CourseProfitPayment" (id,"storeId","purchaseId","staffId","staffNameSnapshot",amount,method,note,"requestKey","actorUserId") VALUES (${id},${storeId},${d.purchaseId},${line.staffId},${line.name},${d.amount},${d.method},${d.note},${d.requestKey},${userId})`;
 await tx.$executeRaw`INSERT INTO "CashbookEntry" (id,"storeId","entryDate",type,"paymentMethod",category,amount,note,"staffId","createdByUserId","updatedAt") VALUES (${"course-profit:"+id},${storeId},${day},'EXPENSE',${d.method}::"CashbookPaymentMethod",'課程店長利潤',${d.amount},${line.label+"／"+line.name+"／"+d.note},${line.staffId},${userId},NOW())`;
 await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","targetType","targetId",action,"afterJson","createdAt") VALUES (${crypto.randomUUID()},${userId},'CourseProfitPayment',${id},'RECORD_PAYMENT',${JSON.stringify({...d,storeId,externalPaymentExecuted:false})}::jsonb,NOW())`;
}
export async function voidCourseProfitPayment(tx:Prisma.TransactionClient,actor:Actor,input:unknown){
 const d=courseFeeVoidInput.parse(input),{storeId,userId}=actor;
 const rows=await tx.$queryRaw<Array<{amount:number;method:string;voidedAt:Date|null;voidReason:string|null}>>`SELECT amount,method,"voidedAt","voidReason" FROM "CourseProfitPayment" WHERE id=${d.paymentId} AND "storeId"=${storeId} FOR UPDATE`;
 const p=rows[0];if(!p)throw new AppError("NOT_FOUND","找不到本店付款");
 if(p.voidedAt){if(p.voidReason!==d.reason)throw new AppError("CONFLICT","此筆已更正，請核對原紀錄");return;}
 const entries=await tx.$queryRaw<Array<{amount:unknown;entryDate:Date;type:string;paymentMethod:string}>>`SELECT amount,"entryDate",type::text,"paymentMethod"::text FROM "CashbookEntry" WHERE id=${"course-profit:"+d.paymentId} AND "storeId"=${storeId} FOR UPDATE`;
 const entry=entries[0];if(!entry||Number(entry.amount)!==p.amount||entry.type!=="EXPENSE"||entry.paymentMethod!==p.method)throw new AppError("CONFLICT","原支出不一致，請先核對");
 if(p.method==="CASH")await lockCourseCashDay(tx,storeId,entry.entryDate);
 await tx.$executeRaw`INSERT INTO "CashbookEntry" (id,"storeId","entryDate",type,"paymentMethod",category,amount,note,"staffId","createdByUserId","updatedAt") SELECT ${"course-profit-void:"+d.paymentId},"storeId","entryDate",'INCOME',"paymentMethod",'店長利潤誤登沖回',amount,${d.reason},"staffId",${userId},NOW() FROM "CashbookEntry" WHERE id=${"course-profit:"+d.paymentId} AND "storeId"=${storeId}`;
 await tx.$executeRaw`UPDATE "CourseProfitPayment" SET "voidedAt"=NOW(),"voidReason"=${d.reason},"voidedBy"=${userId} WHERE id=${d.paymentId} AND "storeId"=${storeId}`;
 await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","targetType","targetId",action,"afterJson","createdAt") VALUES (${crypto.randomUUID()},${userId},'CourseProfitPayment',${d.paymentId},'VOID_REGISTRATION',${JSON.stringify({storeId,reason:d.reason,amount:p.amount,externalPaymentExecuted:false})}::jsonb,NOW())`;
}
