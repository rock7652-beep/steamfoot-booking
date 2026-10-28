import 'server-only';
import {purchaseOrder} from '@/lib/item-entitlement';
import {cardAllowsRecipient} from '@/lib/beauty/member-booking';
import type {Tx} from './booking';
/** Caller owns the store lock. A purchase cannot grant another service's rights. */
export async function findBeautyItemCard(tx:Tx,storeId:string,customerId:string,serviceId:string,at:Date,excludeId:string,sponsorId?:string|null){
 const cards=await tx.beautyCard.findMany({where:{storeId,closedAt:null,serviceIds:{has:serviceId},expiresAt:{gte:new Date(Math.max(Date.now(),+at))},OR:[{memberIds:{has:customerId}},...(sponsorId?[{allowShared:true,memberIds:{has:sponsorId}}]:[])]}});
 const receipts=await tx.beautyPayment.findMany({where:{storeId,cardId:{in:cards.map(c=>c.id)},kind:'SALE'},select:{cardId:true,createdAt:true}});
 for(const card of purchaseOrder(cards,receipts)){
  if(!cardAllowsRecipient(card,customerId,sponsorId))continue;
  const held=await tx.beautyAppointment.count({where:{storeId,cardId:card.id,status:'RESERVED',id:{not:excludeId}}});
  if(card.remaining-held>=1)return card;
 }
 return null;
}
