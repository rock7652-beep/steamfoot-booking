import 'server-only';
import type {Prisma} from '../../../generated/beauty-client';
/** Financial history is immutable. Corrections are independent append-only revisions. */
export async function beautyPaymentVisibility(tx:Pick<Prisma.TransactionClient,'beautyTransactionRevision'>,storeId:string){
 const voided=await tx.beautyTransactionRevision.findMany({where:{storeId,voidedAt:{not:null}},select:{transactionId:true}});
 return {AND:[{id:{notIn:voided.map(r=>r.transactionId)}}]};
}
export async function beautyTransactionRevisions(tx:Pick<Prisma.TransactionClient,'beautyTransactionRevision'>,storeId:string,ids:string[]){
 const rows=await tx.beautyTransactionRevision.findMany({where:{storeId,transactionId:{in:ids}},orderBy:{revision:'desc'}});
 const latest=new Map<string,typeof rows[number]>();for(const row of rows)if(!latest.has(row.transactionId))latest.set(row.transactionId,row);return latest;
}
export async function beautyCardSaleAttribution(tx:Pick<Prisma.TransactionClient,'beautyEvent'>,storeId:string){
 const audits=await tx.beautyEvent.findMany({where:{storeId,kind:'ISSUE_CARD',status:'AUDIT'},select:{body:true}});
 const attribution=new Map<string,string|null>();for(const event of audits){try{const body=JSON.parse(event.body);if(typeof body.cardId==='string'&&Object.hasOwn(body,'revenueStaffId'))attribution.set(body.cardId,typeof body.revenueStaffId==='string'?body.revenueStaffId:null);}catch{/* Historic non-JSON audit entries do not supply attribution. */}}return attribution;
}

/** Only immutable sale audit evidence; never infer historical allocation from today's plan. */
export async function beautySaleAllocations(tx:Pick<Prisma.TransactionClient,'beautyEvent'>,storeId:string,paymentIds:string[]){
 const rows=paymentIds.length?await tx.beautyEvent.findMany({where:{storeId,status:'AUDIT',kind:{in:['ISSUE_CARD','SERVICE_SALE_ATTRIBUTION']},OR:paymentIds.map(id=>({body:{contains:JSON.stringify({paymentId:id}).slice(1,-1)}}))},select:{body:true}}):[];
 const result=new Map<string,{revenueStaffId:string|null;storeAmount:number|null;shortfall:number}>();
 for(const row of rows){try{const body=JSON.parse(row.body),allocation=body.allocation;
  if(typeof body.paymentId!=='string'||!paymentIds.includes(body.paymentId))continue;
  const valid=allocation&&Number.isSafeInteger(allocation.storeAmount)&&allocation.storeAmount>=0;
  result.set(body.paymentId,{revenueStaffId:typeof body.revenueStaffId==='string'?body.revenueStaffId:null,storeAmount:valid?allocation.storeAmount:null,shortfall:valid&&Number.isSafeInteger(allocation.shortfall)?allocation.shortfall:0});
 }catch{/* Unstructured legacy records remain explicitly unset. */}}
 return result;
}
