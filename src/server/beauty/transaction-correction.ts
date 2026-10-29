import 'server-only';
import {beautyCardSaleAttribution} from './transaction-revisions';
import {assertOnlineConfirmationSettled} from './online-confirm-guard';
import {AppError} from '@/lib/errors';
import {lockCashDay} from '@/server/services/cash-day';
import {audit,command,type BeautyActor} from './access';
import type {Tx} from './booking';
type Input={purchaseId:string;requestKey:string;expectedRevision:number;reason:string};
/** Same original transaction controls: metadata correction and unused erroneous receipt reversal. */
export async function correctBeautyTransaction(tx:Tx,a:BeautyActor,input:Input&{operation:'edit'|'void';note?:string;revenueStaffId?:string|null}){
 return command(tx,a,input.requestKey,input,async()=>{
  const payment=await tx.beautyPayment.findFirst({where:{storeId:a.storeId,id:input.purchaseId,kind:'SALE'}});
  const request=payment?null:await tx.beautyPurchase.findFirst({where:{storeId:a.storeId,id:input.purchaseId}});
  const row=payment??request;
  if(!row)throw new AppError('NOT_FOUND','找不到本店交易');
  await assertOnlineConfirmationSettled(tx,a.storeId,{orderId:request?.id,cardId:payment?.cardId});
  const prior=await tx.beautyTransactionRevision.findFirst({where:{storeId:a.storeId,transactionId:row.id},orderBy:{revision:'desc'}});
  if((prior?.revision??0)!==input.expectedRevision)throw new AppError('CONFLICT','交易已更新，請重新開啟核對');
  if(prior?.voidedAt||request&&request.status!=='PENDING')throw new AppError('CONFLICT','交易狀態已變更，請保留原紀錄');
  if(payment&&await tx.beautyPayment.count({where:{storeId:a.storeId,originalPaymentId:payment.id}}))throw new AppError('BUSINESS_RULE','已有退款或沖銷，不能再更正或作廢');
  if(input.operation==='edit'){
   if(input.revenueStaffId){
    const staff=await tx.$queryRaw<{id:string}[]>`SELECT s.id FROM "Staff" s JOIN "User" u ON u.id=s."userId" WHERE s.id=${input.revenueStaffId} AND s."storeId"=${a.storeId} AND s.status::text='ACTIVE' AND u.status::text='ACTIVE'`;
    if(!staff.length)throw new AppError('FORBIDDEN','請選擇本店啟用的人員');
   }
  }else if(request){
   if(request.cardId)throw new AppError('CONFLICT','購買申請已有發卡資料，請先核對');
   await tx.beautyPurchase.update({where:{id:request.id},data:{status:'VOIDED'}});
  }else if(payment){
   // Service receipts can affect frozen technician fees. Preserve those; cancel and refund instead.
   if(!payment.cardId||payment.appointmentId)throw new AppError('BUSINESS_RULE','服務收款請先取消服務並使用退款；此處只作廢未使用的方案誤建交易');
   const card=await tx.beautyCard.findFirst({where:{id:payment.cardId,storeId:a.storeId}});
   const [entries,bookings,sources]=await Promise.all([
    tx.beautyLedger.findMany({where:{storeId:a.storeId,cardId:payment.cardId}}),
    tx.beautyAppointment.count({where:{storeId:a.storeId,cardId:payment.cardId}}),
    tx.beautyPayment.count({where:{storeId:a.storeId,cardId:payment.cardId,kind:'SALE'}}),
   ]);
   if(!card||card.closedAt||card.remaining!==card.sessions||bookings||sources!==1||entries.length!==1||entries[0].kind!=='GRANT'||entries[0].delta!==card.sessions||card.paid!==payment.amount)throw new AppError('BUSINESS_RULE','方案已有預約、使用或帳本異動，不能直接作廢');
   if(payment.amount){
    const receipts=await tx.$queryRaw<{amount:unknown;type:string;paymentMethod:string;entryDate:Date}[]>`SELECT amount,type::text,"paymentMethod"::text,"entryDate" FROM "CashbookEntry" WHERE id=${'beauty:'+payment.id} AND "storeId"=${a.storeId} FOR UPDATE`;
    const receipt=receipts[0];
    if(!receipt||Number(receipt.amount)!==payment.amount||receipt.type!=='INCOME'||receipt.paymentMethod!==(payment.method==='CASH'?'CASH':'OTHER'))throw new AppError('CONFLICT','原收款與收支帳不一致，尚未作廢');
    if(payment.method==='CASH')await lockCashDay(tx,a.storeId,receipt.entryDate,{requireOpen:true});
    await tx.$executeRaw`INSERT INTO "CashbookEntry" (id,"storeId","entryDate",type,"paymentMethod",category,amount,note,"createdByUserId","updatedAt") SELECT ${'beauty-void:'+payment.id},"storeId","entryDate",'EXPENSE',"paymentMethod",'美業誤建沖銷',amount,${'作廢：'+input.reason},${a.userId},NOW() FROM "CashbookEntry" WHERE id=${'beauty:'+payment.id} AND "storeId"=${a.storeId}`;
   }
   await tx.beautyCard.update({where:{id:card.id},data:{remaining:0,closedAt:new Date()}});
   await tx.beautyLedger.create({data:{storeId:a.storeId,cardId:card.id,kind:'VOID',delta:-card.remaining,actorUserId:a.userId}});
   await tx.beautyPurchase.updateMany({where:{storeId:a.storeId,cardId:card.id},data:{status:'VOIDED'}});
  }
  const originalStaff=input.operation==='void'&&!prior&&payment?.cardId?(await beautyCardSaleAttribution(tx,a.storeId)).get(payment.cardId)??null:null;
  const correction={storeId:a.storeId,transactionId:row.id,revision:(prior?.revision??0)+1,note:input.operation==='edit'?input.note!:prior?.note??payment?.note??'',revenueStaffId:input.operation==='edit'?input.revenueStaffId??null:prior?prior.revenueStaffId:originalStaff,voidedAt:input.operation==='void'?new Date():null,voidReason:input.operation==='void'?input.reason:null,actorUserId:a.userId!};
  await tx.beautyTransactionRevision.create({data:correction});
  await audit(tx,a,input.operation==='edit'?'EDIT_TRANSACTION':'VOID_TRANSACTION',JSON.stringify({id:row.id,before:{note:prior?.note??payment?.note??'',revenueStaffId:prior?.revenueStaffId??null,revision:prior?.revision??0},...input}));
  return {id:row.id};
 });
}
