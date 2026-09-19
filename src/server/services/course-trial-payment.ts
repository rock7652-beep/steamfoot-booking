import "server-only";
import type { Prisma } from "../../../generated/course-client";
import { AppError } from "@/lib/errors";
import { toLocalDateStr } from "@/lib/date-utils";
import { normalizePaymentSplits, type PaymentSplitInput, type PaymentMethodValue } from "@/lib/payment-splits";

type Actor = {storeId:string;userId:string};
type Input = {bookingId:string;requestKey:string;amount:number;paymentMethod:PaymentMethodValue;paymentSplits?:PaymentSplitInput[];note?:string;originalPaymentId?:string;reason?:string};
/** Caller checks trial.confirm (+ transaction.void for correction), holding the course store lock. */
export async function collectCourseTrialInTransaction(tx:Prisma.TransactionClient, actor:Actor, input:Input, pricing?:{trialAllowPriceEdit:boolean;trialMinPrice:number;trialMaxPrice:number}) {
  const {storeId,userId}=actor;
  const splits=normalizePaymentSplits(input.paymentSplits,input.amount);
  if(!Number.isSafeInteger(input.amount)||input.amount<0||input.amount>1000000) throw new AppError("VALIDATION","體驗金額不正確");
  const prior=await tx.courseTrialPayment.findUnique({where:{storeId_requestKey:{storeId,requestKey:input.requestKey}}});
  if(prior){
    if(prior.bookingId!==input.bookingId||prior.amount!==input.amount||prior.paymentMethod!==input.paymentMethod||JSON.stringify(prior.paymentSplits)!==JSON.stringify(splits)||prior.note!==(input.note??"")) throw new AppError("CONFLICT","收款請求已使用，請重新確認");
    return prior;
  }
  const booking=await tx.courseBooking.findFirst({where:{id:input.bookingId,storeId,bookingKind:"TRIAL",cardId:null},include:{session:true,trialPayments:{where:{status:"SUCCESS"}}}});
  if(!booking||booking.status==="CANCELLED"||booking.session.cancelledAt) throw new AppError("VALIDATION","找不到可收款的本店體驗預約");
  if(input.amount !== booking.trialPrice && (!pricing?.trialAllowPriceEdit || input.amount < pricing.trialMinPrice || input.amount > pricing.trialMaxPrice)) throw new AppError("VALIDATION","收款金額不符合體驗價格設定，請重新核對");
  const current=booking.trialPayments[0];
  if(input.originalPaymentId){
    if(!current||current.id!==input.originalPaymentId||!input.reason?.trim()) throw new AppError("CONFLICT","原收款已變更，請重新開啟明細");
    if(booking.status!=="RESERVED") throw new AppError("VALIDATION","已出席或未到的體驗不可更正收款，請先核對出席狀態");
    await tx.courseTrialPayment.update({where:{id:current.id},data:{status:"VOIDED",voidedAt:new Date(),voidReason:input.reason}});
    const originalSplits=Array.isArray(current.paymentSplits)?current.paymentSplits as PaymentSplitInput[]:[{paymentMethod:current.paymentMethod,amount:current.amount}];
    for(const [i,part] of originalSplits.entries()) if(part.amount>0) await writeCash(tx,actor,`course-trial-void:${current.id}:${i}`,part.amount,part.paymentMethod,"EXPENSE",`體驗收款更正沖銷 / ${booking.id} / ${input.reason}`);
  }else if(current) throw new AppError("CONFLICT","此體驗已收款，未重複收取；如需修改請使用收款更正");
  const receipt=await tx.courseTrialPayment.create({data:{storeId,bookingId:booking.id,amount:input.amount,paymentMethod:input.paymentMethod,...(splits?{paymentSplits:splits}:{}),requestKey:input.requestKey,note:input.note??"",actorUserId:userId}});
  for(const [i,part] of (splits??[{paymentMethod:input.paymentMethod,amount:input.amount}]).entries()) if(part.amount>0) await writeCash(tx,actor,`course-trial:${receipt.id}:${i}`,part.amount,part.paymentMethod,"INCOME",`體驗收款 / ${booking.customerName} / ${booking.id}`);
  await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","targetType","targetId",action,"beforeJson","afterJson","createdAt") VALUES (${crypto.randomUUID()},${userId},'CourseBooking',${booking.id},${input.originalPaymentId?'CORRECT_TRIAL_PAYMENT':'COLLECT_TRIAL_PAYMENT'},${JSON.stringify({paymentId:current?.id??null,status:booking.status})}::jsonb,${JSON.stringify({paymentId:receipt.id,amount:receipt.amount,status:booking.status,attendanceUnchanged:true})}::jsonb,NOW())`;
  // Deliberately no CourseBooking status, card or point-entry mutation.
  return receipt;
}
async function writeCash(tx:Prisma.TransactionClient,actor:Actor,id:string,amount:number,method:string,type:"INCOME"|"EXPENSE",note:string){
  const day=new Date(toLocalDateStr()+"T00:00:00Z");
  await tx.$executeRaw`INSERT INTO "CashbookEntry" (id,"storeId","entryDate",type,"paymentMethod",category,amount,note,"createdByUserId","updatedAt") VALUES (${id},${actor.storeId},${day},${type}::"CashbookEntryType",${method==='CASH'?'CASH':'OTHER'}::"CashbookPaymentMethod",'課程體驗',${amount},${note},${actor.userId},NOW())`;
}

/** Same no-wallet void capability as mature transactions; records reversal only, never a bank refund. */
export async function voidCourseTrialInTransaction(tx:Prisma.TransactionClient,actor:Actor,paymentId:string,reason:string){
  if(!reason.trim())throw new AppError("VALIDATION","請填寫作廢原因");
  const payment=await tx.courseTrialPayment.findFirst({where:{id:paymentId,storeId:actor.storeId}});
  if(!payment)throw new AppError("NOT_FOUND","找不到本店體驗收款");
  if(payment.status==="VOIDED")return payment;
  const result=await tx.courseTrialPayment.update({where:{id:payment.id},data:{status:"VOIDED",voidedAt:new Date(),voidReason:reason}});
  const splits=Array.isArray(payment.paymentSplits)?payment.paymentSplits as PaymentSplitInput[]:[{paymentMethod:payment.paymentMethod,amount:payment.amount}];
  for(const [i,part] of splits.entries())if(part.amount>0)await writeCash(tx,actor,`course-trial-void:${payment.id}:${i}`,part.amount,part.paymentMethod,"EXPENSE",`體驗收款作廢 / ${payment.bookingId} / ${reason}`);
  await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","targetType","targetId",action,"beforeJson","afterJson","createdAt") VALUES (${crypto.randomUUID()},${actor.userId},'CourseTrialPayment',${payment.id},'VOID_TRIAL_PAYMENT',${JSON.stringify({status:payment.status,amount:payment.amount})}::jsonb,${JSON.stringify({status:"VOIDED",reason,attendanceUnchanged:true,automaticBankRefund:false})}::jsonb,NOW())`;
  return result;
}
