import type {ServiceRosterMetadata} from '@/app/(dashboard)/dashboard/courses/roster-source';

/** List status only; the collection panel retains the authoritative breakdown. */
export function beautyRosterPaymentSummary({price,payment}:Pick<ServiceRosterMetadata,'price'|'payment'>) {
  if(!payment)return `待核對 NT$ ${price.toLocaleString()}`;
  if(payment.due>0)return `待收 NT$ ${payment.due.toLocaleString()}`;
  if(payment.netPrice===0)return '免收款';
  return `已收 NT$ ${payment.collected.toLocaleString()}`;
}
