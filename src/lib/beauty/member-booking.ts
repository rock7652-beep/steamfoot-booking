import { z } from 'zod';
import { partyInput, key } from './contracts';
import { parseTaipeiDateTime } from '@/lib/date-utils';

/** Member identity is resolved on the server, never accepted from the form. */
export const memberPartyInput = partyInput.innerType().pick({requestKey:true,policyRevision:true,date:true,time:true}).extend({
  people:z.array(z.object({serviceId:key,serviceRevision:z.number().int().nonnegative().default(0),specifiedTechnicianId:key.nullable().default(null),cardId:key.nullable().default(null),notes:z.string().max(1000).default('')})).min(1).max(12),
}).refine(d=>!!parseTaipeiDateTime(d.date,d.time)&&/:(00|30)$/.test(d.time),'請選擇半小時的預約時段');
export type MemberPartyInput=z.infer<typeof memberPartyInput>;
export type MemberBookingCard={id:string;name:string;remaining:number;held:number;expiresAt:string;closed:boolean;memberIds:string[];serviceIds:string[];allowShared?:boolean};
export function applicableCards(cards:MemberBookingCard[],serviceId:string,customerId:string,date:string,time:string,companion:boolean){
  const at=parseTaipeiDateTime(date,time);if(!at)return [];
  return cards.filter(c=>!c.closed&&c.remaining>c.held&&c.memberIds.includes(customerId)&&c.serviceIds.includes(serviceId)&&(!companion||c.allowShared===true)&&Date.parse(c.expiresAt)>+at).sort((a,b)=>a.expiresAt.localeCompare(b.expiresAt)||a.id.localeCompare(b.id));
}
export function cardAllowsRecipient(card:{allowShared:boolean;memberIds:string[]},customerId:string|null,sponsorId?:string|null){
  return (!!customerId&&card.memberIds.includes(customerId))||(card.allowShared&&!!sponsorId&&card.memberIds.includes(sponsorId));
}

/** Keep shared opening/closing rules; only the Beauty member start grid changes. */
export function halfHourRule<T extends {slotInterval:number;periods:{openTime:string;closeTime:string;slotInterval:number}[]}>(rule:T):T{
 const round=(clock:string)=>{const [h,m]=clock.split(':').map(Number),n=Math.ceil((h*60+m)/30)*30;return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;};
 return {...rule,slotInterval:30,periods:rule.periods.map(p=>({...p,openTime:round(p.openTime),slotInterval:30})).filter(p=>p.openTime<p.closeTime)};
}
