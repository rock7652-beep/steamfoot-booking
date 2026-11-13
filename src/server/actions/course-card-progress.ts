"use server";
import {readMusicTuition} from "@/server/services/music-tuition";
import {z} from 'zod';
import {prisma} from '@/lib/db';
import {coursePrisma} from '@/lib/course-db';
import {courseManagerRead} from '@/server/services/course-access';
import {getManagerCustomerWhere} from '@/lib/manager-visibility';
import {musicCardWhere} from '@/server/services/music-plan-scope';
import {courseSessionAdjustmentRecords} from '@/server/services/course-session-adjustment-records';
import {AppError,handleActionError} from '@/lib/errors';

import {projectCourseCardProgress} from '@/server/services/course-card-progress-projection';
export async function loadCourseCardProgress(input:unknown){
 try{
  const d=z.object({cardId:z.string().min(1).max(100),customerId:z.string().min(1).max(100),expectedStoreId:z.string().min(1).max(100),dataScope:z.enum(['operational','legacy']).optional()}).parse(input);
  const actors=await Promise.all(['wallet.read','customer.read','booking.read'].map(permission=>courseManagerRead(permission as 'wallet.read'|'customer.read'|'booking.read')));
  const {user,storeId}=actors[0];
  if(storeId!==d.expectedStoreId||actors.some(a=>a.storeId!==storeId||a.user.id!==user.id))throw new AppError('FORBIDDEN','門市或權限已變更，請重新開啟方案');
  const visibility=getManagerCustomerWhere(user.role,user.staffId,storeId);
  const customer=await prisma.customer.findFirst({where:{...visibility,storeId,id:d.customerId,mergedIntoCustomerId:null},select:{id:true}});
  if(!customer)throw new AppError('NOT_FOUND','找不到可查看的本店學員');
  const priceActor=await courseManagerRead("transaction.read").catch(()=>null);
  const canReadPrice=priceActor?.storeId===storeId&&priceActor?.user.id===user.id;
  return await coursePrisma.$transaction(async tx=>{
   const card=await tx.coursePointCard.findFirst({where:{id:d.cardId,storeId,AND:[musicCardWhere(storeId,d.dataScope)],OR:[{members:{some:{customerId:d.customerId,storeId}}},{bookings:{some:{customerId:d.customerId,storeId}}}]},select:{id:true,unit:true,requestKey:true,musicOpeningStateRequired:true,members:{select:{customerId:true}},entries:{where:{kind:'GRANT'},select:{points:true}}}});
   if(!card)throw new AppError('NOT_FOUND','找不到此學員的本店方案');
   const readPurchase=async(ids:string[])=>{
    const purchases=canReadPrice?await tx.coursePurchase.findMany({where:{storeId,cardId:card.id,status:'CONFIRMED',voidedAt:null,customerId:{in:ids}},select:{id:true,price:true,createdAt:true},orderBy:{createdAt:'asc'}}):[];
    const tuition=await readMusicTuition(tx,storeId,purchases.map(p=>p.id));
    return {canReadPrice,purchasePrice:purchases.length?purchases.reduce((sum,p)=>sum+(tuition.get(p.id)?.due??p.price),0):null,purchasedAt:purchases[0]?.createdAt.toISOString()??null};
   };
   return projectCourseCardProgress(card,d.customerId,async()=>{
    const [bookings,adjustments]=await Promise.all([
     tx.courseBooking.findMany({where:{storeId,cardId:card.id,status:'ATTENDED',pointCost:{gt:0},bookingKind:{not:'OPENING_MAKEUP'}},orderBy:[{session:{startsAt:'asc'}},{id:'asc'}],take:2001,select:{id:true,customerId:true,customerName:true,pointCost:true,session:{select:{startsAt:true,nameSnapshot:true}}}}),
     courseSessionAdjustmentRecords(tx,storeId,[card.id]),
    ]);return {bookings,adjustments};
   },ids=>prisma.customer.findMany({where:{...visibility,storeId,id:{in:ids},mergedIntoCustomerId:null},select:{id:true,name:true}}),readPurchase);
  },{isolationLevel:'RepeatableRead'});
 }catch(error){const r=handleActionError(error);return {success:false as const,error:r.success?'讀取失敗，請重試':r.error};}
}
