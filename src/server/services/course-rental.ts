import { lockCashDay } from "./cash-day";
import "server-only";
import type { Prisma } from "../../../generated/course-client";
import { AppError } from "@/lib/errors";
import { toLocalDateStr } from "@/lib/date-utils";

export async function rentalConflict(tx:Prisma.TransactionClient,storeId:string,roomId:string,start:Date,end:Date,exclude?:string,beauty=false) {
  const {assertSportsSeriesFree}=await import("./sports-permanent-series");
  if(!beauty)await assertSportsSeriesFree(tx,storeId,[{startsAt:start,endsAt:end}],{roomId,coachId:""});
  const [course,rental]=await Promise.all([
    tx.courseSession.findFirst({where:{storeId,roomId,cancelledAt:null,releasedAt:null,startsAt:{lt:end},endsAt:{gt:start}}}),
    tx.courseRental.findFirst({where:{storeId,roomId,cancelledAt:null,...(exclude?{id:{not:exclude}}:{}),occupiedStartsAt:{lt:end},occupiedEndsAt:{gt:start}}}),
  ]);
  if(beauty){const conflicts=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "BeautyAppointment" WHERE "storeId"=${storeId} AND "locationId"=${roomId} AND status<>'CANCELLED' AND "startsAt"<${end} AND "occupiedEndsAt">${start} LIMIT 1`;if(conflicts.length)throw new AppError('CONFLICT','這個位置已有美業預約，請換時間或位置');}
  if(course||rental)throw new AppError("CONFLICT","這個空間已有課程或租借，請換時間或空間");
}
export async function rentalAudit(tx:Prisma.TransactionClient,storeId:string,userId:string,id:string,action:string,before:unknown,after:unknown,module:"course"|"beauty"="course") {
  await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","storeId",module,summary,"targetType","targetId",action,"beforeJson","afterJson","createdAt") VALUES (${crypto.randomUUID()},${userId},${storeId},${module==='beauty'?'BEAUTY':'COURSE'},'空間租借','CourseRental',${id},${action},${JSON.stringify({storeId,data:before})}::jsonb,${JSON.stringify({storeId,data:after})}::jsonb,NOW())`;
}
export async function rentalCash(tx:Prisma.TransactionClient,actor:{storeId:string;userId:string;staffId?:string|null},payment:{id:string;amount:number;paymentMethod:string},customerId:string|null,note:string,voiding=false) {
  if(!payment.amount)return;
  const day=new Date(toLocalDateStr()+"T00:00:00Z");
  // Never silently modify a closed cash drawer snapshot.
  if(payment.paymentMethod==="CASH") {
    await lockCashDay(tx,actor.storeId,day);
  }
  const id=`course-rental${voiding?"-void":""}:${payment.id}`;
  const type=voiding?"EXPENSE":"INCOME";
  await tx.$executeRaw`INSERT INTO "CashbookEntry" (id,"storeId","entryDate",type,"paymentMethod",category,amount,note,"staffId","customerId","createdByUserId","updatedAt") VALUES (${id},${actor.storeId},${day},${type}::"CashbookEntryType",${payment.paymentMethod}::"CashbookPaymentMethod",'其他收入',${payment.amount},${note},${actor.staffId??null},${customerId},${actor.userId},NOW())`;
}
