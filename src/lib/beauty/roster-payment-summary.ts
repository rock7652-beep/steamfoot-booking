import type {ServiceRosterMetadata} from '@/app/(dashboard)/dashboard/courses/roster-source';

/** List status only; the collection panel retains the authoritative breakdown. */
export function beautyRosterPaymentSummary({price,payment}:Pick<ServiceRosterMetadata,'price'|'payment'>) {
  if(!payment)return `待核對 NT$ ${price.toLocaleString()}`;
  if(payment.due>0)return `待收 NT$ ${payment.due.toLocaleString()}`;
  if(payment.netPrice===0)return '免收款';
  return `已收 NT$ ${payment.collected.toLocaleString()}`;
}

/** Existing unpaid single reservations may consume a matching plan at completion.
 * This is a display hint; the completion transaction rechecks and reserves rights. */
export function beautyRosterCanUsePlan(row:{status:string;bookingKind:string;sportsBalance?:{available:number}|null;service?:Pick<ServiceRosterMetadata,'payment'>}){
 return row.status==='RESERVED'&&row.bookingKind==='SINGLE'&&(row.sportsBalance?.available??0)>0&&row.service?.payment?.collected===0&&row.service.payment.due>0;
}
