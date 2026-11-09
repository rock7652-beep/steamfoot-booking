import {addOnSnapshots,addOnTotals} from "@/lib/beauty/add-ons";
import 'server-only';
import {AppError} from '@/lib/errors';
import {beautyServiceQuote} from '@/lib/beauty/service-charge';
import {beautyPaymentVisibility} from './transaction-revisions';
import type {Tx} from './booking';
export type ServiceDiscount={kind:'AMOUNT'|'PERCENT';value:number};
export type ServiceCharge={id:string;revision:number;personName:string;serviceName:string;price:number;items?:{id:string;name:string;price:number;duration:number}[];basePrice?:number;baseCovered?:boolean;discount:ServiceDiscount;reduction:number;netPrice:number;collected:number;due:number};
/** Read the effective service quote without overwriting the original list-price snapshot or receipts. */
export async function serviceCharges(tx:Tx,storeId:string,items:{id:string;revision:number;personName:string;serviceName:string;price:number;cardId?:string|null;addOnItems?:unknown}[],receipts?:{appointmentId:string|null;amount:number}[]):Promise<ServiceCharge[]>{
 if(!items.length)return [];
 const ids=items.map(b=>b.id);
 const [events,payments]=await Promise.all([
  tx.beautyEvent.findMany({where:{storeId,kind:'SERVICE_DISCOUNT',status:'AUDIT',appointmentId:{in:ids}},orderBy:[{createdAt:'desc'},{id:'desc'}],select:{appointmentId:true,body:true}}),
  receipts?Promise.resolve(receipts):tx.beautyPayment.findMany({where:{storeId,appointmentId:{in:ids},kind:{in:['SALE','REFUND']},...(await beautyPaymentVisibility(tx,storeId))}}),
 ]);
 return items.map(b=>{
  const snapshots=addOnSnapshots.parse(b.addOnItems??[]);
  const chargeablePrice=(b.cardId?0:b.price)+addOnTotals(snapshots).price;
  const event=events.find(e=>e.appointmentId===b.id);
  let quote;try{quote=beautyServiceQuote(chargeablePrice,event?.body??null);}catch{throw new AppError('CONFLICT','優惠紀錄待核對，請重新開啟');}
  const collected=payments.filter(p=>p.appointmentId===b.id).reduce((sum,p)=>sum+p.amount,0);
  return {...b,items:snapshots,basePrice:b.price,baseCovered:!!b.cardId,price:chargeablePrice,...quote,collected,due:Math.max(0,quote.netPrice-collected)};
 });
}
export function servicePaymentLabel(charge:ServiceCharge){return charge.netPrice===0?'免收款':charge.collected>=charge.netPrice?'已收款':charge.collected>0?'部分收款':'待收款';}
