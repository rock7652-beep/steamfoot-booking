import 'server-only';
import {prisma} from '@/lib/db';
import {coursePrisma} from '@/lib/course-db';
import {courseManagerRead} from './course-access';
import {getManagerCustomerWhere} from '@/lib/manager-visibility';
import {musicCardWhere} from './music-plan-scope';
import {courseSessionAdjustmentRecords} from './course-session-adjustment-records';
import {readMusicTuition} from './music-tuition';
import {projectCourseCardProgress,progressCardSelect,progressBookingSelect} from './course-card-progress-projection';
import {AppError,handleActionError} from '@/lib/errors';
import {z} from 'zod';

/** IDs originate in an authorized page, and are rechecked here. No cross-request authorization cache. */
export async function readCourseCardProgressBatch(input:unknown){
 const d=z.object({cardIds:z.array(z.string().min(1).max(100)).max(20),customerId:z.string().min(1).max(100),expectedStoreId:z.string().min(1).max(100),dataScope:z.enum(['operational','legacy']).optional()}).parse(input);
 const cardIds=[...new Set(d.cardIds)];
 if(!cardIds.length)return [];
 try{
  const actors=await Promise.all(['wallet.read','customer.read','booking.read'].map(p=>courseManagerRead(p as 'wallet.read'|'customer.read'|'booking.read')));
  const {user,storeId}=actors[0];
  if(storeId!==d.expectedStoreId||actors.some(a=>a.storeId!==storeId||a.user.id!==user.id))throw new AppError('FORBIDDEN','門市或權限已變更，請重新開啟方案');
  const visibility={...getManagerCustomerWhere(user.role,user.staffId,storeId),storeId,mergedIntoCustomerId:null};
  if(!await prisma.customer.findFirst({where:{...visibility,id:d.customerId},select:{id:true}}))throw new AppError('NOT_FOUND','找不到可查看的本店學員');
  const priceActor=await courseManagerRead('transaction.read').catch(()=>null);
  const canReadPrice=priceActor?.storeId===storeId&&priceActor?.user.id===user.id;
  return await coursePrisma.$transaction(async tx=>{
   // Nested take applies to each card, preserving the original 2001 overflow sentinel.
   const cards=await tx.coursePointCard.findMany({where:{id:{in:cardIds},storeId,AND:[musicCardWhere(storeId,d.dataScope)],OR:[{members:{some:{customerId:d.customerId,storeId}}},{bookings:{some:{customerId:d.customerId,storeId}}}]},select:{...progressCardSelect,bookings:{where:{storeId,status:'ATTENDED',pointCost:{gt:0},bookingKind:{not:'OPENING_MAKEUP'}},orderBy:[{session:{startsAt:'asc'}},{id:'asc'}],take:2001,select:progressBookingSelect}}});
   const ids=cards.map(c=>c.id);
   const adjustments=await courseSessionAdjustmentRecords(tx,storeId,ids);
   const peopleIds=[...new Set([d.customerId,...cards.flatMap(c=>[...c.members.map(m=>m.customerId),...c.bookings.flatMap(b=>b.customerId?[b.customerId]:[])]),...adjustments.flatMap(r=>r.customerId?[r.customerId]:[])])];
   const people=await prisma.customer.findMany({where:{...visibility,id:{in:peopleIds}},select:{id:true,name:true}});
   const purchases=canReadPrice?await tx.coursePurchase.findMany({where:{storeId,cardId:{in:ids},status:'CONFIRMED',voidedAt:null,customerId:{in:people.map(p=>p.id)}},select:{id:true,cardId:true,customerId:true,price:true,createdAt:true},orderBy:{createdAt:'asc'}}):[];
   const tuition=await readMusicTuition(tx,storeId,purchases.map(p=>p.id));
   return Promise.all(cardIds.map(async cardId=>{
    const card=cards.find(c=>c.id===cardId);
    if(!card)return {cardId,result:{success:false as const,error:'找不到此學員的本店方案'}};
    const result=await projectCourseCardProgress(card,d.customerId,async()=>({bookings:card.bookings,adjustments:adjustments.filter(r=>r.cardId===card.id)}),async wanted=>people.filter(p=>wanted.includes(p.id)),async wanted=>{
     const rows=purchases.filter(p=>p.cardId===cardId&&wanted.includes(p.customerId));
     return {canReadPrice,purchasePrice:rows.length?rows.reduce((sum,p)=>sum+(tuition.get(p.id)?.due??p.price),0):null,purchasedAt:rows[0]?.createdAt.toISOString()??null};
    });return {cardId,result};
   }));
  },{isolationLevel:'RepeatableRead'});
 }catch(error){const r=handleActionError(error);return cardIds.map(cardId=>({cardId,result:{success:false as const,error:r.success?'讀取失敗，請重試':r.error}}));}
}
