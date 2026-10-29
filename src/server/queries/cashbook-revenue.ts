import 'server-only';
import type {Prisma} from '@prisma/client';
import {isRetailCashbookCategory} from '@/lib/cashbook-entry-kind';

/** Only generated sales refunds/corrections reverse revenue; ordinary expenses never do. */
export const inventoryReceiptReversalWhere:Prisma.CashbookEntryWhereInput={
 type:'EXPENSE',id:{startsWith:'inventory:'},OR:[
  {category:{in:['銷貨退款','工單退款']},id:{endsWith:':refund'}},
  {id:{contains:':correction:'}},
 ],
};
export const cashbookRevenueWhere:Prisma.CashbookEntryWhereInput={OR:[{type:'INCOME'},inventoryReceiptReversalWhere]};
export async function readCashbookRevenue(tx:Pick<Prisma.TransactionClient,'cashbookEntry'>,where:Prisma.CashbookEntryWhereInput){
 const rows=await tx.cashbookEntry.groupBy({by:['type','category'],where:{AND:[where,cashbookRevenueWhere]},_sum:{amount:true}});
 let retail=0,otherIncome=0,inventoryRefund=0,inventoryReversal=0;
 for(const row of rows){const amount=Number(row._sum.amount??0);
  if(row.type==='INCOME'){if(isRetailCashbookCategory(row.category))retail+=amount;else otherIncome+=amount;}
  else if(['銷貨退款','工單退款'].includes(row.category??''))inventoryRefund+=amount;else inventoryReversal+=amount;
 }
 return {retail,otherIncome,inventoryRefund,inventoryReversal,cashbookRefund:inventoryRefund+inventoryReversal};
}
