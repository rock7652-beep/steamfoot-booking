import 'server-only';
import {purchaseOrder,sumItemBalances,type ItemBalance} from '@/lib/item-entitlement';
import {courseCardCoversDate} from '@/lib/course-card-expiry';
import {courseCardStartIssue} from '@/lib/course-card-start';
import {MUSIC_OPENING_SELECT,readMusicOpeningCard} from '@/lib/music-opening-runtime';
import {musicItemTemplateIds} from './music-item-compatibility';
import {musicCourseExpiry} from '@/lib/music-course-products';
import type {Prisma} from '../../../generated/course-client';

/** Native paid rights only; source-bound opening/makeup rights keep their dedicated flows. */
export async function musicItemCards(tx:Prisma.TransactionClient,storeId:string,customerIds:string[],session:{id:string;templateId:string;startsAt:Date},excludeBookingId?:string){
 const cards=await tx.coursePointCard.findMany({where:{storeId,closedAt:null,unit:'SESSION',expiresAt:{gte:new Date()},members:{some:{customerId:{in:customerIds}}}},include:{members:true,musicOpeningState:{select:MUSIC_OPENING_SELECT},bookings:{where:{status:'RESERVED',...(excludeBookingId?{id:{not:excludeBookingId}}:{})},select:{pointCost:true}}}});
 if(!cards.length)return cards;
 const [purchases,aliases,joins]=await Promise.all([
  tx.coursePurchase.findMany({where:{storeId,cardId:{in:cards.map(c=>c.id)},status:'CONFIRMED',voidedAt:null},select:{cardId:true,createdAt:true}}),
  musicItemTemplateIds(tx,storeId,session.templateId),
  tx.courseSession.findMany({where:{storeId,id:{in:cards.flatMap(c=>c.musicJoinSessionId?[c.musicJoinSessionId]:[])}},select:{id:true,startsAt:true}}),
 ]);
 const result:typeof cards=[];
 for(const card of purchaseOrder(cards,purchases)){
  if(readMusicOpeningCard(card,storeId).kind!=='NATIVE'||card.requestKey.startsWith('music-leave-makeup:')||card.requestKey.startsWith('no-show-makeup:'))continue;
  if(!card.templateIds.some(id=>aliases.includes(id)))continue;
  if(!courseCardCoversDate(card,storeId,new Date()))continue;
  const expiry=card.musicValidityDays&&!card.musicActivatedAt?musicCourseExpiry(session.startsAt,card.musicValidityDays):card.expiresAt;
  if(expiry?session.startsAt>expiry:!courseCardCoversDate(card,storeId,session.startsAt))continue;
  const join=joins.find(row=>row.id===card.musicJoinSessionId);
  if(courseCardStartIssue(!!card.musicJoinSessionId,join?.startsAt,session.startsAt))continue;
  // Native packages count uses of this item, not admission to specific sale dates.
  result.push(card);
 }
 return result;
}
export async function readMusicItemBalances(tx:Prisma.TransactionClient,storeId:string,customerIds:string[],session:{id:string;templateId:string;startsAt:Date}){
 const rows=await musicItemCards(tx,storeId,customerIds,session);
 const result=new Map<string,ItemBalance&{byUnit:ItemBalance[]}>();
 for(const id of new Set(customerIds)){
  const byUnit=sumItemBalances(rows.filter(c=>c.members.some(m=>m.customerId===id)).map(c=>({id:c.id,remaining:c.remaining,available:Math.max(0,c.remaining-c.bookings.reduce((n,b)=>n+b.pointCost,0)),cost:1,unit:c.unit,planName:c.nameSnapshot})));
  if(byUnit[0])result.set(id,{...byUnit[0],byUnit});
 }
 return result;
}
export async function bindMusicAttendanceCard(tx:Prisma.TransactionClient,actor:{storeId:string;userId:string},bookingId:string){
 const booking=await tx.courseBooking.findFirst({where:{id:bookingId,storeId:actor.storeId},include:{session:true}});
 if(!booking||booking.cardId||booking.bookingKind!=='UNPAID'||!booking.customerId)return;
 const cards=await musicItemCards(tx,actor.storeId,[booking.customerId],booking.session,booking.id);
 const card=cards.find(c=>c.remaining-c.bookings.reduce((n,b)=>n+b.pointCost,0)>=1);
 if(!card)return;
 await tx.courseBooking.update({where:{id:booking.id},data:{cardId:card.id,bookingKind:'CARD',pointCost:1}});
 const {bindMusicLesson}=await import('./music-lesson-periods');
 await bindMusicLesson(tx,actor.storeId,{...booking,cardId:card.id},card);
 await tx.coursePointEntry.create({data:{storeId:actor.storeId,cardId:card.id,bookingId:booking.id,kind:'RESERVE',points:1,actorUserId:actor.userId}});
}
