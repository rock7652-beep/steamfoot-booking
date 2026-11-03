import {z} from 'zod';
export const beautyPaymentMethod=z.enum(['CASH','BANK_TRANSFER','CARD','OTHER']);
export const beautyPaymentSplits=z.array(z.object({method:beautyPaymentMethod,amount:z.number().int().positive().max(10000000)})).min(2).max(4).refine(rows=>new Set(rows.map(r=>r.method)).size===rows.length,'混合支付方式不可重複');
export type BeautyPaymentSplit=z.infer<typeof beautyPaymentSplits>[number];
/** Deterministic attribution across appointments; refunds keep the original method rows. */
export function distributeBeautyPayments(amounts:number[],method:BeautyPaymentSplit['method'],splits?:BeautyPaymentSplit[]):BeautyPaymentSplit[][]{
 if(!splits)return amounts.map(amount=>[{method,amount}]);
 beautyPaymentSplits.parse(splits);
 if(splits.reduce((n,s)=>n+s.amount,0)!==amounts.reduce((n,a)=>n+a,0))throw new Error('混合支付合計須等於本次收款');
 const remaining=splits.map(s=>({...s}));
 return amounts.map(amount=>{
  let due=amount;const rows:BeautyPaymentSplit[]=[];
  for(const split of remaining){const paid=Math.min(due,split.amount);if(paid){rows.push({method:split.method,amount:paid});due-=paid;split.amount-=paid;}}
  return rows.length?rows:[{method,amount:0}];
 });
}
