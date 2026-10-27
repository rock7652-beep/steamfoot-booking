import 'server-only';
import {randomUUID} from 'node:crypto';
import {AppError} from '@/lib/errors';
import {findSportsCard} from './sports-card-selection';
import {readSportsSessionRule} from './sports-staging-schedule';
import {musicItemCards} from './music-item-cards';
import {rebindPendingMusicLesson} from './music-lesson-periods';
import {enqueueOperationAudit} from './operation-audit-outbox';
import type {Prisma} from '../../../generated/course-client';
import type {CourseActor} from './course-booking';

/** Store lock required. Reconcile a pending legacy assignment at attendance,
 * never completed/cancelled records, source-bound rights, or companion grants. */
export async function reconcileCourseItemCard(tx:Prisma.TransactionClient,actor:CourseActor,bookingId:string,itemModule:'SPORTS'|'MUSIC'){
 if(actor.customerId)throw new AppError('FORBIDDEN','項目扣抵僅限店家授權人員');
 const booking=await tx.courseBooking.findFirst({where:{id:bookingId,storeId:actor.storeId},include:{session:true,card:true}});
 if(!booking||booking.status!=='RESERVED'||booking.session.cancelledAt||booking.bookingKind!=='CARD'||!booking.card||!booking.customerId||booking.companionIndex||booking.makeupForBookingId||booking.musicOpeningSourceLessonKey||booking.card.musicOpeningStateRequired||['no-show-makeup:','music-leave-makeup:','yjy-pilot-'].some(prefix=>booking.card!.requestKey.startsWith(prefix)))return;
 let picked:{card:typeof booking.card;cost:number}|null=null;
 if(itemModule==='SPORTS'){
  const rule=await readSportsSessionRule(tx,actor.storeId,booking.sessionId);
  if(!rule)return;
  picked=await findSportsCard(tx,actor.storeId,booking.customerId,[booking.session],rule,null,booking.id,true);
 }else{
  const cards=await musicItemCards(tx,actor.storeId,[booking.customerId],booking.session,booking.id);
  const card=cards.find(card=>card.remaining-card.bookings.reduce((sum,row)=>sum+row.pointCost,0)>=1);
  if(card)picked={card,cost:1};
 }
 if(!picked)throw new AppError('VALIDATION','請先繳費／購買本授課項目的有效方案，尚未記錄出席或扣堂');
 if(picked.card.id===booking.cardId&&picked.cost===booking.pointCost)return;
 const period=itemModule==='MUSIC'?await rebindPendingMusicLesson(tx,actor.storeId,booking,picked.card):null;
 const key=randomUUID();
 // Reuse the established usage-change ledger kinds. These release/re-reserve
 // holds only; no remaining credit, purchase or historical debit is rewritten.
 if(booking.pointCost>0)await tx.coursePointEntry.create({data:{storeId:actor.storeId,bookingId:booking.id,cardId:booking.card.id,kind:`RELEASE:USAGE:${key}`,points:booking.pointCost,actorUserId:actor.userId}});
 await tx.coursePointEntry.create({data:{storeId:actor.storeId,bookingId:booking.id,cardId:picked.card.id,kind:`RESERVE:USAGE:${key}`,points:picked.cost,actorUserId:actor.userId}});
 await tx.courseBooking.update({where:{id:booking.id},data:{cardId:picked.card.id,pointCost:picked.cost}});
 await enqueueOperationAudit({actorUserId:actor.userId,actorNameSnapshot:actor.name,storeId:actor.storeId,module:'COURSE',targetType:'CourseBooking',targetId:booking.id,action:'RECONCILE_ITEM_CARD',summary:'依授課項目先買先扣，保留原預約與扣抵歷程',before:{cardId:booking.cardId,pointCost:booking.pointCost,period:period?.before??null},after:{cardId:picked.card.id,pointCost:picked.cost,period:period?.after??null}},tx,key);
}
