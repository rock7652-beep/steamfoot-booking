import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import type {Prisma} from '@prisma/client';
import {AppError} from '@/lib/errors';
import {sharedGoodsSelection,sharedGoodsSnapshots,resolveSharedGoods,courseSubjectAddOnGroups,moduleAddOnGroups,resolveModuleAddOns,addOnSnapshots,addOnTotals,bookingAddOnGroups} from '@/lib/add-ons';
import {lockCashDay} from './cash-day';
import {parseTaiwanDateToDbDate,toLocalDateStr} from '@/lib/date-utils';
export type AddOnActor={storeId:string;userId:string;staffId:string|null;module?:'STEAMFOOT'|'FITNESS'|'MUSIC'};
export type AddOnSubject={ownership?:'PERSON'|'RESERVATION';reservationKey?:string;serviceId?:string|null;id:string;bookingId:string;customerId:string|null;status:string;bookingStatus:string};

/** Snapshot the authorized subject inside the same business transaction.
 * This captures order contents, not a per-item allocation of a receipt/refund. */
export async function addOnAuditEvidence(tx:Prisma.TransactionClient,a:AddOnActor,p:AddOnSubject,result:Prisma.InputJsonObject,method?:string):Promise<Prisma.InputJsonObject>{
 const [customer,order]=await Promise.all([
  p.customerId?tx.customer.findFirst({where:{id:p.customerId,storeId:a.storeId},select:{name:true}}):null,
  Array.isArray(result.after)?null:tx.serviceAddOnOrder.findUnique({where:p.ownership==='RESERVATION'?{storeId_module_bookingId_reservationKey:{storeId:a.storeId,module:a.module??'STEAMFOOT',bookingId:p.bookingId,reservationKey:p.reservationKey!}}:{storeId_module_participantId:{storeId:a.storeId,module:a.module??'STEAMFOOT',participantId:p.id}},select:{items:true}}),
 ]);
 return {...result,customerName:customer?.name??null,items:Array.isArray(result.after)?result.after:order?.items??[],...(method?{paymentMethod:method}:{})};
}
export async function addOnCommand<T extends Prisma.InputJsonValue>(tx:Prisma.TransactionClient,a:AddOnActor,key:string,intent:unknown,work:()=>Promise<T>):Promise<T>{
 const hash=createHash('sha256').update(JSON.stringify({actor:a.userId,...(a.module&&a.module!=='STEAMFOOT'?{module:a.module}:{}),intent})).digest('hex');
 const prior=await tx.serviceAddOnCommand.findUnique({where:{storeId_requestKey:{storeId:a.storeId,requestKey:key}}});
 if(prior){if(prior.hash!==hash)throw new AppError('CONFLICT','此請求已使用，請重新核對');return prior.result as T;}
 const result=await work();await tx.serviceAddOnCommand.create({data:{storeId:a.storeId,requestKey:key,hash,result}});return result;
}
export async function readAddOnOrder(tx:Prisma.TransactionClient,a:AddOnActor,p:AddOnSubject){
 const catalog=await tx.serviceAddOnCatalog.findUnique({where:{storeId_module:{storeId:a.storeId,module:a.module??'STEAMFOOT'}}});
 const applicable=a.module==='FITNESS'||a.module==='MUSIC'?courseSubjectAddOnGroups(a.module,catalog?.groups??[],p.serviceId):moduleAddOnGroups(a.module??'STEAMFOOT',catalog?.groups??[]);
 const shared=p.ownership==='RESERVATION';
 if(shared&&!p.reservationKey)throw new AppError('FORBIDDEN','缺少整筆預約歸屬');
 const groups=applicable.filter(g=>shared?g.kind==='SHARED_GOODS':g.kind!=='SHARED_GOODS');
 const order=await tx.serviceAddOnOrder.findUnique({where:shared?{storeId_module_bookingId_reservationKey:{storeId:a.storeId,module:a.module??'STEAMFOOT',bookingId:p.bookingId,reservationKey:p.reservationKey!}}:{storeId_module_participantId:{storeId:a.storeId,module:a.module??'STEAMFOOT',participantId:p.id}}});
 if(order&&shared&&order.ownership!=='RESERVATION')throw new AppError('CONFLICT','商品歸屬不符');
 const items=shared?sharedGoodsSnapshots.parse(order?.items??[]):addOnSnapshots.parse(order?.items??[]);
 const editableGroups=bookingAddOnGroups(groups,items).map(g=>shared?{...g,kind:'SHARED_GOODS' as const,required:false}:g);
 const receipts=order?await tx.serviceAddOnReceipt.findMany({where:{storeId:a.storeId,orderId:order.id},orderBy:{createdAt:'asc'}}):[];
 return {...(shared?{purchasableIds:groups.flatMap(g=>g.options.filter(o=>o.active).map(o=>o.id))}:{}),catalogRevision:catalog?.revision??0,groups:moduleAddOnGroups(a.module??'STEAMFOOT',editableGroups),order:order?{id:order.id,revision:order.revision,total:order.total,cancelled:order.cancelled,items}:null,receipts:receipts.map(r=>({id:r.id,amount:r.amount,method:r.method,originalId:r.originalId,createdAt:r.createdAt.toISOString()})),collected:receipts.reduce((n,r)=>n+r.amount,0),editable:!['CANCELLED','NO_SHOW'].includes(p.status)&&!['CANCELLED','NO_SHOW'].includes(p.bookingStatus)};
}
export async function saveAddOnOrder(tx:Prisma.TransactionClient,a:AddOnActor,p:AddOnSubject,d:{revision:number;catalogRevision:number;ids:string[];selections?:unknown}){
 const current=await readAddOnOrder(tx,a,p);
 if(!current.editable)throw new AppError('CONFLICT','已取消或未到的預約不能新增附加項目');
 if((current.order?.revision??0)!==d.revision||current.catalogRevision!==d.catalogRevision)throw new AppError('CONFLICT','預約或品項已更新，請重新開啟');
 if(p.ownership==='RESERVATION'){for(const selection of sharedGoodsSelection.parse(d.selections??[])){if(!current.purchasableIds?.includes(selection.id)&&selection.quantity>(current.order?.items.find(i=>i.id===selection.id)?.quantity??0))throw new AppError('CONFLICT','商品已停用或不適用，只能保留或減少原有數量');}}
 let items;try{items=p.ownership==='RESERVATION'?resolveSharedGoods(current.groups,d.selections??[]):resolveModuleAddOns(a.module??'STEAMFOOT',current.groups,d.ids);}catch(e){throw new AppError('VALIDATION',e instanceof Error?e.message:'請核對附加項目');}
 const total=addOnTotals(items).price;
 if(total<current.collected)throw new AppError('CONFLICT','修改後低於已收款，請先退回差額');
 if(!current.order&&items.length===0)return {id:null,revision:0,before:[],after:[]};
 const order=current.order?await tx.serviceAddOnOrder.update({where:{id:current.order.id},data:{items,total,cancelled:false,revision:{increment:1}}}):await tx.serviceAddOnOrder.create({data:{id:randomUUID(),storeId:a.storeId,module:a.module??'STEAMFOOT',bookingId:p.bookingId,participantId:p.ownership==='RESERVATION'?null:p.id,ownership:p.ownership??'PERSON',reservationKey:p.ownership==='RESERVATION'?p.reservationKey:null,items,total,revision:1}});
 return {id:order.id,revision:order.revision,before:current.order?.items??[],after:items};
}
export async function postAddOnReceipt(tx:Prisma.TransactionClient,a:AddOnActor,p:AddOnSubject,d:{revision:number;amount:number;method:string;originalId?:string}){
 const current=await readAddOnOrder(tx,a,p),order=current.order;
 if(!order||order.revision!==d.revision)throw new AppError('CONFLICT','附加項目已更新，請重新開啟');
 const refund=!!d.originalId;
 if(!refund&&(!current.editable||order.cancelled))throw new AppError('CONFLICT','此預約不能收取附加項目款項');
 if(!Number.isSafeInteger(d.amount)||d.amount<=0)throw new AppError('VALIDATION','請填寫有效金額');
 let staffId=a.staffId;
 if(refund){
  const original=current.receipts.find(r=>r.id===d.originalId&&r.amount>0);
  const refunded=current.receipts.filter(r=>r.originalId===d.originalId).reduce((n,r)=>n-r.amount,0);
  if(!original||d.amount>original.amount-refunded||d.amount>current.collected)throw new AppError('CONFLICT','退款超過可退金額');
  const originalCash=await tx.cashbookEntry.findFirst({where:{id:'addon:'+original.id,storeId:a.storeId},select:{staffId:true}});staffId=originalCash?.staffId??null;
 }else{
  if(d.amount>order.total-current.collected)throw new AppError('CONFLICT','收款超過未收餘額');
  const customer=p.customerId?await tx.customer.findFirst({where:{id:p.customerId,storeId:a.storeId,mergedIntoCustomerId:null},select:{assignedStaffId:true}}):null;
  if(p.customerId&&!customer)throw new AppError('CONFLICT','顧客資料已變更');staffId=customer?.assignedStaffId??a.staffId;
 }
 if(!staffId||!await tx.staff.findFirst({where:{id:staffId,storeId:a.storeId},select:{id:true}}))throw new AppError('BUSINESS_RULE','請先設定本店營收歸屬店長');
 const day=parseTaiwanDateToDbDate(toLocalDateStr());
 if(d.method==='CASH')await lockCashDay(tx,a.storeId,day,{requireOpen:true});
 const receipt=await tx.serviceAddOnReceipt.create({data:{id:randomUUID(),storeId:a.storeId,orderId:order.id,amount:refund?-d.amount:d.amount,method:d.method,originalId:d.originalId??null,actorId:a.userId}});
 await tx.cashbookEntry.create({data:{id:'addon:'+receipt.id,storeId:a.storeId,entryDate:day,type:refund?'EXPENSE':'INCOME',paymentMethod:d.method==='CASH'?'CASH':'OTHER',category:refund?'附加項目退款':'附加項目',amount:d.amount,staffId,customerId:p.customerId,createdByUserId:a.userId,note:`${refund?'退回':'已確認收款'} ${d.method}｜${order.items.map(i=>i.name+(i.quantity>1?' × '+i.quantity:'')).join('、')}`}});
 await tx.serviceAddOnOrder.update({where:{id:order.id},data:{revision:{increment:1}}});
 return {id:receipt.id,amount:receipt.amount};
}
