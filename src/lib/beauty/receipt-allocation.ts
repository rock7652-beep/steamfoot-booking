import {beautyAllocationAfterRefund} from './sale-allocation';
type Receipt={id:string;kind:string;amount:number;originalPaymentId?:string|null;createdAt:Date|string};
type Frozen={storeAmount:number|null};
type Allocation={storeAmount:number;developerAmount:number};
/** Each refund reverses the difference between cumulative totals, including refunds outside the report window. */
export function beautyReceiptAllocations(receipts:Receipt[],frozen:ReadonlyMap<string,Frozen>){
 const rows=[...new Map(receipts.map(row=>[row.id,row])).values()];
 const result=new Map<string,Allocation|null>();
 const bySale=new Map<string,Receipt[]>();
 for(const row of rows){
  result.set(row.id,null);
  if(row.kind==='REFUND'&&row.originalPaymentId){const group=bySale.get(row.originalPaymentId)??[];group.push(row);bySale.set(row.originalPaymentId,group);}
 }
 for(const sale of rows.filter(row=>row.kind==='SALE')){
  const store=frozen.get(sale.id)?.storeAmount;
  if(store==null||![sale.amount,store].every(v=>Number.isSafeInteger(v)&&v>=0)||store>sale.amount)continue;
  const refunds=(bySale.get(sale.id)??[]).sort((a,b)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime()||a.id.localeCompare(b.id));
  if(refunds.some(row=>!Number.isSafeInteger(row.amount)||row.amount>0)||-refunds.reduce((n,row)=>n+row.amount,0)>sale.amount)continue;
  result.set(sale.id,{storeAmount:store,developerAmount:sale.amount-store});
  let refunded=0,before={storeAmount:store,developerAmount:sale.amount-store};
  for(const row of refunds){
   refunded-=row.amount;
   const after=beautyAllocationAfterRefund(sale.amount,store,refunded);
   result.set(row.id,{storeAmount:after.storeAmount-before.storeAmount,developerAmount:after.developerAmount-before.developerAmount});
   before=after;
  }
 }
 return result;
}
/** Collect only the fixed fee still unallocated after actual refunds; never infer missing historical costs. */
export function beautyServiceCollectionAllocation(paid:number,cost:number|null,receipts:Receipt[],frozen:ReadonlyMap<string,Frozen>){
 if(cost==null)return null;
 if(![paid,cost].every(v=>Number.isSafeInteger(v)&&v>=0))throw Error('收款與固定費用待核對');
 const amounts=beautyReceiptAllocations(receipts,frozen);
 if(receipts.some(row=>row.amount!==0&&!amounts.get(row.id)))return null;
 const priorStore=receipts.reduce((n,row)=>n+(amounts.get(row.id)?.storeAmount??0),0);
 const storeAmount=Math.min(paid,Math.max(0,cost-priorStore));
 return {storeAmount,developerAmount:paid-storeAmount,shortfall:Math.max(0,cost-priorStore-storeAmount)};
}

export type BeautySaleShare={storeAmount:number;managerAmount:number;unassignedAmount:number;unknownAmount:number};
export function beautySaleShare(amount:number,allocation:Allocation|null|undefined,assigned:boolean):BeautySaleShare{
 return allocation?{storeAmount:allocation.storeAmount,managerAmount:assigned?allocation.developerAmount:0,unassignedAmount:assigned?0:allocation.developerAmount,unknownAmount:0}:{storeAmount:0,managerAmount:0,unassignedAmount:0,unknownAmount:amount};
}
export function sumBeautySaleShares(rows:{saleAllocation?:BeautySaleShare}[]):BeautySaleShare{
 return rows.reduce((n,row)=>({storeAmount:n.storeAmount+(row.saleAllocation?.storeAmount??0),managerAmount:n.managerAmount+(row.saleAllocation?.managerAmount??0),unassignedAmount:n.unassignedAmount+(row.saleAllocation?.unassignedAmount??0),unknownAmount:n.unknownAmount+(row.saleAllocation?.unknownAmount??0)}),{storeAmount:0,managerAmount:0,unassignedAmount:0,unknownAmount:0});
}
