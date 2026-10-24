import 'server-only';
import {AppError} from '@/lib/errors';
import {calculateCourseCheckout} from '@/lib/course-checkout';
import {beautyPaymentVisibility} from './transaction-revisions';
import type {Tx} from './booking';
export type ServiceDiscount={kind:'AMOUNT'|'PERCENT';value:number};
export type ServiceCharge={id:string;revision:number;personName:string;serviceName:string;price:number;discount:ServiceDiscount;reduction:number;netPrice:number;collected:number;due:number};
/** Read the effective service quote without overwriting the original list-price snapshot or receipts. */
export async function serviceCharges(tx:Tx,storeId:string,items:{id:string;revision:number;personName:string;serviceName:string;price:number}[],receipts?:{appointmentId:string|null;amount:number}[]):Promise<ServiceCharge[]>{
 if(!items.length)return [];
 const ids=items.map(b=>b.id);
 const [events,payments]=await Promise.all([
  tx.beautyEvent.findMany({where:{storeId,kind:'SERVICE_DISCOUNT',status:'AUDIT',appointmentId:{in:ids}},orderBy:[{createdAt:'desc'},{id:'desc'}],select:{appointmentId:true,body:true}}),
  receipts?Promise.resolve(receipts):tx.beautyPayment.findMany({where:{storeId,appointmentId:{in:ids},kind:{in:['SALE','REFUND']},...(await beautyPaymentVisibility(tx,storeId))}}),
 ]);
 return items.map(b=>{
  const event=events.find(e=>e.appointmentId===b.id);let discount:ServiceDiscount={kind:'AMOUNT',value:0};
  if(event){try{const d=JSON.parse(event.body);if(!['AMOUNT','PERCENT'].includes(d.kind)||typeof d.value!=='number'||d.price!==b.price)throw Error();discount={kind:d.kind,value:d.value};}catch{throw new AppError('CONFLICT','優惠紀錄待核對，請重新開啟');}}
  let quote;try{quote=calculateCourseCheckout(b.price,discount.kind,discount.value);}catch{throw new AppError('CONFLICT','優惠紀錄待核對');}
  const collected=payments.filter(p=>p.appointmentId===b.id).reduce((sum,p)=>sum+p.amount,0);
  return {...b,discount,reduction:quote.discount,netPrice:quote.paid,collected,due:Math.max(0,quote.paid-collected)};
 });
}
export function servicePaymentLabel(charge:ServiceCharge){return charge.netPrice===0?'免收款':charge.collected>=charge.netPrice?'已收款':charge.collected>0?'部分收款':'待收款';}
