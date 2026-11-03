import 'server-only';
import {beautyServiceGoodsGroups} from '@/lib/beauty/shared-goods';
import {AppError} from '@/lib/errors';
import {addOnTotals,bookingAddOnGroups,resolveSharedGoods,sharedGoodsSelection,sharedGoodsSnapshots} from '@/lib/add-ons';
import {readBeautyGoodsCatalog} from './shared-goods-catalog';
import {beautyPaymentVisibility} from './transaction-revisions';
import {recordBeautyCash} from './commerce';
import {audit,command,type BeautyActor} from './access';
import type {Prisma} from '../../../generated/beauty-client';
type Tx=Prisma.TransactionClient;
export type BeautyGoodsSubject={groupId:string;customerId:string|null;editable:boolean};
export async function lockBeautyGoodsSubject(tx:Tx,a:BeautyActor,bookingId:string,participantId:string):Promise<BeautyGoodsSubject>{
 const appointment=await tx.beautyAppointment.findFirst({where:{storeId:a.storeId,id:participantId},select:{id:true,groupId:true}});
 if(!appointment||![appointment.id,appointment.groupId].includes(bookingId))throw new AppError('NOT_FOUND','顧客不屬於此美業預約');
 const [group]=await tx.$queryRaw<{id:string;customerId:string|null}[]>`SELECT id,"customerId" FROM "BeautyGroup" WHERE "storeId"=${a.storeId} AND id=${appointment.groupId} FOR UPDATE`;
 if(!group)throw new AppError('NOT_FOUND','找不到本店預約');
 const items=await tx.beautyAppointment.findMany({where:{storeId:a.storeId,groupId:group.id},select:{status:true}});
 return {groupId:group.id,customerId:group.customerId,editable:items.some(i=>!['CANCELLED','NO_SHOW'].includes(i.status))};
}
const displayMethod=(m:string)=>m==='BANK_TRANSFER'?'TRANSFER':m==='CARD'?'CREDIT_CARD':m;
export async function readBeautyGoodsOrder(tx:Tx,a:BeautyActor,p:BeautyGoodsSubject){
 const [catalog,order]=await Promise.all([readBeautyGoodsCatalog(a.storeId),tx.beautySharedGoodsOrder.findUnique({where:{storeId_groupId:{storeId:a.storeId,groupId:p.groupId}}})]);
 const items=sharedGoodsSnapshots.parse(order?.items??[]);
 const appointments=await tx.beautyAppointment.findMany({where:{storeId:a.storeId,groupId:p.groupId,status:{notIn:['CANCELLED','NO_SHOW']}},select:{serviceId:true}});
 const applicable=beautyServiceGoodsGroups(catalog.groups,appointments.map(item=>item.serviceId));
 const payments=order?await tx.beautyPayment.findMany({where:{storeId:a.storeId,sharedGoodsOrderId:order.id,kind:{in:['SALE','REFUND']},...(await beautyPaymentVisibility(tx,a.storeId))},orderBy:[{createdAt:'asc'},{id:'asc'}]}):[];
 return {catalogRevision:catalog.revision,groups:catalog.enabled?bookingAddOnGroups(applicable,items).map(g=>({...g,kind:'SHARED_GOODS' as const,required:false})):[],purchasableIds:applicable.flatMap(g=>g.options.filter(o=>o.active).map(o=>o.id)),canSelect:catalog.enabled,order:order?{id:order.id,revision:order.revision,total:order.total,cancelled:false,items}:null,receipts:payments.map(r=>({id:r.id,amount:r.amount,method:displayMethod(r.method),originalId:r.originalPaymentId,createdAt:r.createdAt.toISOString()})),collected:payments.reduce((n,r)=>n+r.amount,0),editable:p.editable};
}
export async function saveBeautyGoodsOrder(tx:Tx,a:BeautyActor,p:BeautyGoodsSubject,d:{revision:number;catalogRevision:number;selections:unknown}){
 const current=await readBeautyGoodsOrder(tx,a,p);
 if(!current.canSelect)throw new AppError('FORBIDDEN','附加選購已關閉，既有款項仍可處理');
 if(!p.editable)throw new AppError('CONFLICT','預約已取消或未到，不能新增選購');
 if((current.order?.revision??0)!==d.revision||current.catalogRevision!==d.catalogRevision)throw new AppError('CONFLICT','商品設定或訂單已更新，請重新開啟');
 for(const selection of sharedGoodsSelection.parse(d.selections))if(!current.purchasableIds.includes(selection.id)&&selection.quantity>(current.order?.items.find(i=>i.id===selection.id)?.quantity??0))throw new AppError('CONFLICT','商品已停售或不適用，只能保留或減少原數量');
 let items;try{items=resolveSharedGoods(current.groups,d.selections);}catch(e){throw new AppError('VALIDATION',e instanceof Error?e.message:'請核對商品數量');}
 const total=addOnTotals(items).price;
 if(total<current.collected)throw new AppError('CONFLICT','修改後低於已收款，請先退回差額');
 if(!current.order&&!items.length)return {id:null,revision:0,before:[],after:[]};
 const order=current.order?await tx.beautySharedGoodsOrder.update({where:{id:current.order.id},data:{items,total,revision:{increment:1}}}):await tx.beautySharedGoodsOrder.create({data:{storeId:a.storeId,groupId:p.groupId,items,total}});
 await audit(tx,a,'SHARED_GOODS_ITEMS',JSON.stringify({groupId:p.groupId,before:current.order?.items??[],after:items,commission:'PENDING_PHASE_2'}));
 return {id:order.id,revision:order.revision,before:current.order?.items??[],after:items};
}
export async function postBeautyGoodsReceipt(tx:Tx,a:BeautyActor,p:BeautyGoodsSubject,d:{revision:number;amount:number;method:string;originalId?:string;reason?:string}){
 const current=await readBeautyGoodsOrder(tx,a,p),order=current.order;
 if(!a.userId)throw new AppError('FORBIDDEN','請重新登入');
 if(!order||order.revision!==d.revision)throw new AppError('CONFLICT','商品訂單已更新，請重新開啟');
 if(!Number.isSafeInteger(d.amount)||d.amount<=0||d.amount>10000000||!['CASH','BANK_TRANSFER','CARD','OTHER'].includes(d.method))throw new AppError('VALIDATION','請核對收退款金額與方式');
 const original=d.originalId?current.receipts.find(r=>r.id===d.originalId&&r.amount>0):undefined;
 if(d.originalId){const refunded=current.receipts.filter(r=>r.originalId===d.originalId).reduce((n,r)=>n-r.amount,0);if(!original||d.amount>original.amount-refunded||d.amount>current.collected)throw new AppError('CONFLICT','退款超過尚可退金額');}
 else if(!p.editable||d.amount>order.total-current.collected)throw new AppError('CONFLICT','此預約不能收款，或收款超過未收餘額');
 const payment=await tx.beautyPayment.create({data:{storeId:a.storeId,sharedGoodsOrderId:order.id,kind:original?'REFUND':'SALE',originalPaymentId:original?.id??null,amount:original?-d.amount:d.amount,method:d.method,note:original&&d.reason?d.reason:'共同商品：'+order.items.map(i=>i.name+(i.quantity>1?' × '+i.quantity:'')).join('、'),actorUserId:a.userId}});
 await recordBeautyCash(tx,a,payment.method,payment.amount,payment.id,payment.note);
 if(!original){const [owner]=p.customerId?await tx.$queryRaw<{assignedStaffId:string|null}[]>`SELECT s.id AS "assignedStaffId" FROM "Customer" c LEFT JOIN "Staff" s ON s.id=c."assignedStaffId" AND s."storeId"=c."storeId" WHERE c.id=${p.customerId} AND c."storeId"=${a.storeId}`:[];await audit(tx,a,'SHARED_GOODS_SALE_ATTRIBUTION',JSON.stringify({paymentId:payment.id,groupId:p.groupId,revenueStaffId:owner?.assignedStaffId??null,allocation:null,commission:'PENDING_PHASE_2'}));}
 await tx.beautySharedGoodsOrder.update({where:{id:order.id},data:{revision:{increment:1}}});
 await audit(tx,a,original?'SHARED_GOODS_REFUND':'SHARED_GOODS_COLLECT',JSON.stringify({groupId:p.groupId,paymentId:payment.id,amount:payment.amount,originalId:original?.id??null}));
 return {id:payment.id,amount:payment.amount};
}
/** The global transaction list delegates goods refunds to the same ledger writer. */
export async function refundBeautyGoodsFromTransaction(tx:Tx,a:BeautyActor,d:{purchaseId:string;requestKey:string;amount:number;method:string;expectedRefundedAmount:number;reason?:string}){
 return command(tx,a,d.requestKey,{operation:'native-goods-refund',...d},async()=>{
 const original=await tx.beautyPayment.findFirst({where:{id:d.purchaseId,storeId:a.storeId,kind:'SALE'}});
 if(!original?.sharedGoodsOrderId)throw new AppError('NOT_FOUND','找不到本店商品收款');
 const order=await tx.beautySharedGoodsOrder.findFirst({where:{id:original.sharedGoodsOrderId,storeId:a.storeId}});if(!order)throw new AppError('NOT_FOUND','找不到原商品單');
 await tx.$queryRaw`SELECT id FROM "BeautyGroup" WHERE "storeId"=${a.storeId} AND id=${order.groupId} FOR UPDATE`;
 const p={groupId:order.groupId,customerId:null,editable:false},current=await readBeautyGoodsOrder(tx,a,p);
 const refunded=current.receipts.filter(r=>r.originalId===original.id).reduce((n,r)=>n-r.amount,0);if(refunded!==d.expectedRefundedAmount)throw new AppError('CONFLICT','退款紀錄已更新，請重新核對');
 return postBeautyGoodsReceipt(tx,a,p,{revision:order.revision,amount:d.amount,method:d.method,originalId:original.id,reason:d.reason});
 });
}
