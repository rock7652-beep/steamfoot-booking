import { z } from "zod";
import { courseAllocationAfterRefund } from "./course-sale-allocation";
export const settlementMonth = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
export const settlementSettingsInput = z.object({ profitEnabled:z.boolean(), feeEnabled:z.boolean(), personalIncomeEnabled:z.boolean().optional(), revision:z.number().int().nonnegative() });
export const settlementConfirmInput = z.object({ month:settlementMonth, fingerprint:z.string().length(64), revision:z.number().int().nonnegative(), reason:z.string().trim().min(1).max(500) });
export const profitPaymentInput = z.object({ month:settlementMonth, purchaseId:z.string().min(1).max(180), amount:z.number().int().positive().max(1000000), expectedRemaining:z.number().int().positive(), method:z.enum(["CASH","OTHER"]), note:z.string().trim().min(1).max(500), requestKey:z.string().uuid() });
export type SettlementLine = { kind:"PROFIT"|"FEE"; id:string; staffId:string|null; name:string; label:string; date:string; amount:number|null; paid:number; issue:string|null; payments:{id:string;amount:number;date:string;note:string;voided:boolean;reason:string|null}[] };
export function currentDeveloperProfit(order:{price:number;storeCostSnapshot:number|null;developerProfitSnapshot:number|null;status:string}, refunded:number):number|null {
  if(order.storeCostSnapshot===null || order.developerProfitSnapshot===null)return null;
  if(order.storeCostSnapshot+order.developerProfitSnapshot!==order.price)return null;
  if(order.status==="VOIDED")return 0;
  return courseAllocationAfterRefund(order.price,order.storeCostSnapshot,refunded).developerAmount;
}
export function summarizeSettlement(lines:SettlementLine[]) {
  const people=new Map<string,{id:string;name:string;profit:number;fee:number;paid:number;remaining:number;issues:number;lines:SettlementLine[]}>();
  for(const line of lines){
    const id=line.staffId??"unassigned";
    const row=people.get(id)??{id,name:line.name,profit:0,fee:0,paid:0,remaining:0,issues:0,lines:[]};
    if(line.kind==="PROFIT")row.profit+=line.amount??0;else row.fee+=line.amount??0;
    row.paid+=line.paid;row.remaining+=(line.amount??0)-line.paid;row.issues+=line.issue?1:0;row.lines.push(line);people.set(id,row);
  }
  return [...people.values()].sort((a,b)=>a.name.localeCompare(b.name,"zh-Hant"));
}
