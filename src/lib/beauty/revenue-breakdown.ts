import type {ModuleRevenueRow} from '@/lib/module-revenue-report';
import {sumBeautySaleShares} from './receipt-allocation';
type ReceiptRow=Pick<ModuleRevenueRow,'staffId'|'coachName'|'netAmount'|'refund'|'saleAllocation'>;
export function beautyRevenueBreakdown(rows:ReceiptRow[]){
 const summarize=(items:ReceiptRow[])=>{
  const shares=sumBeautySaleShares(items.map(row=>({saleAllocation:row.saleAllocation??{storeAmount:0,managerAmount:0,unassignedAmount:0,unknownAmount:row.netAmount}})));
  const gross=items.filter(r=>!r.refund).reduce((n,r)=>n+r.netAmount,0),refunds=items.filter(r=>r.refund).reduce((n,r)=>n-r.netAmount,0),net=gross-refunds;
  return {...shares,gross,refunds,net,count:items.filter(r=>!r.refund).length,difference:net-Object.values(shares).reduce((n,v)=>n+v,0)};
 };
 const groups=new Map<string|null,ReceiptRow[]>();
 for(const row of rows){const group=groups.get(row.staffId)??[];group.push(row);groups.set(row.staffId,group);}
 const managers=[...groups].map(([id,items])=>({id:id??'unassigned',name:items[0].coachName??(id?'人員資料待核對':'未歸屬'),...summarize(items)})).sort((a,b)=>b.managerAmount-a.managerAmount||a.name.localeCompare(b.name,'zh-TW'));
 const totals=summarize(rows);return {totals,managers,hasDifferences:totals.difference!==0||managers.some(r=>r.difference!==0)};
}
export type BeautyRevenueBreakdown=ReturnType<typeof beautyRevenueBreakdown>;
export type TechnicianService={id:string;technicianId:string;fee:number};
export type TechnicianPayment={appointmentId:string|null;amount:number};
export function beautyTechnicianBreakdown(services:TechnicianService[],payments:TechnicianPayment[],names:{id:string;name:string}[]){
 const paid=new Map<string,number>();for(const p of payments)if(p.appointmentId)paid.set(p.appointmentId,(paid.get(p.appointmentId)??0)+p.amount);
 const groups=new Map<string,{id:string;name:string;services:number;fee:number;paid:number;unpaid:number;overpaid:number}>();
 for(const s of services){const amount=paid.get(s.id)??0,row=groups.get(s.technicianId)??{id:s.technicianId,name:names.find(t=>t.id===s.technicianId)?.name??'技師資料待核對',services:0,fee:0,paid:0,unpaid:0,overpaid:0};row.services++;row.fee+=s.fee;row.paid+=amount;row.unpaid+=Math.max(0,s.fee-amount);row.overpaid+=Math.max(0,amount-s.fee);groups.set(s.technicianId,row);}
 return [...groups.values()].sort((a,b)=>b.fee-a.fee||a.name.localeCompare(b.name,'zh-TW'));
}
