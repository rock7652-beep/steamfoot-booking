"use server";
import {z} from 'zod';
import {prisma} from '@/lib/db';
import {coursePrisma} from '@/lib/course-db';
import {courseManagerRead} from '@/server/services/course-access';
import {getManagerCustomerWhere} from '@/lib/manager-visibility';
import {musicCardWhere} from '@/server/services/music-plan-scope';
import {courseSessionAdjustmentRecords} from '@/server/services/course-session-adjustment-records';
import {activeSessionAdjustments} from '@/lib/plan-session-adjustment';
import {courseDisplayName} from '@/lib/course-template-presentation';
import {parseTaipeiDateTime} from '@/lib/date-utils';
import {AppError,handleActionError} from '@/lib/errors';
import type {CompletedLesson} from '@/components/admin/lesson-progress-grid';

const unavailable=(reason:string)=>({success:true as const,data:{available:false as const,reason}});
export async function loadCourseCardProgress(input:unknown){
 try{
  const d=z.object({cardId:z.string().min(1).max(100),customerId:z.string().min(1).max(100),expectedStoreId:z.string().min(1).max(100),dataScope:z.enum(['operational','legacy']).optional()}).parse(input);
  const actors=await Promise.all(['wallet.read','customer.read','booking.read'].map(permission=>courseManagerRead(permission as 'wallet.read'|'customer.read'|'booking.read')));
  const {user,storeId}=actors[0];
  if(storeId!==d.expectedStoreId||actors.some(a=>a.storeId!==storeId||a.user.id!==user.id))throw new AppError('FORBIDDEN','門市或權限已變更，請重新開啟方案');
  const visibility=getManagerCustomerWhere(user.role,user.staffId,storeId);
  const customer=await prisma.customer.findFirst({where:{...visibility,storeId,id:d.customerId,mergedIntoCustomerId:null},select:{id:true}});
  if(!customer)throw new AppError('NOT_FOUND','找不到可查看的本店學員');
  return await coursePrisma.$transaction(async tx=>{
   const card=await tx.coursePointCard.findFirst({where:{id:d.cardId,storeId,AND:[musicCardWhere(storeId,d.dataScope)],OR:[{members:{some:{customerId:d.customerId,storeId}}},{bookings:{some:{customerId:d.customerId,storeId}}}]},select:{id:true,unit:true,requestKey:true,musicOpeningStateRequired:true,members:{select:{customerId:true}},entries:{where:{kind:'GRANT'},select:{points:true}}}});
   if(!card)throw new AppError('NOT_FOUND','找不到此學員的本店方案');
   if(card.unit!=='SESSION')return unavailable('點數方案請查看完整使用紀錄。');
   if(card.musicOpeningStateRequired||card.requestKey.startsWith('yjy-'))return unavailable('來源方案請由完整紀錄核對上課進度。');
   const total=card.entries.reduce((sum,e)=>sum+e.points,0);
   if(!Number.isInteger(total)||total<1||total>2000)return unavailable('方案總堂數待核對，請查看完整紀錄。');
   const [bookings,adjustments]=await Promise.all([
    tx.courseBooking.findMany({where:{storeId,cardId:card.id,status:'ATTENDED',pointCost:{gt:0},bookingKind:{not:'OPENING_MAKEUP'}},orderBy:[{session:{startsAt:'asc'}},{id:'asc'}],take:2001,select:{id:true,customerId:true,customerName:true,pointCost:true,session:{select:{startsAt:true,nameSnapshot:true}}}}),
    courseSessionAdjustmentRecords(tx,storeId,[card.id]),
   ]);
   const backfills=activeSessionAdjustments(adjustments).filter(r=>r.operation==='BACKFILL');
   const ids=[...new Set([...card.members.map(m=>m.customerId),...bookings.map(b=>b.customerId),...backfills.map(r=>r.customerId)].filter((id):id is string=>!!id))];
   const people=await prisma.customer.findMany({where:{...visibility,storeId,id:{in:ids},mergedIntoCustomerId:null},select:{id:true,name:true}});
   const visible=new Map(people.map(p=>[p.id,p.name]));
   if(ids.some(id=>!visible.has(id))||bookings.some(b=>!b.customerId))return unavailable('此共用方案含其他學員的紀錄，請查看你有權限讀取的完整紀錄。');
   if(bookings.length>2000||bookings.some(b=>b.pointCost!==1)||backfills.some(r=>!r.occurredOn||!parseTaipeiDateTime(r.occurredOn,'00:00')))return unavailable('部分上課資料需核對，請查看完整紀錄。');
   if(bookings.length+backfills.reduce((sum,r)=>sum+r.quantity,0)>total)return unavailable('上課筆數與方案總堂數待核對，請查看完整紀錄。');
   const completed:CompletedLesson[]=[...bookings.map(b=>({id:b.id,date:b.session.startsAt.toISOString(),customerName:visible.get(b.customerId!)!,courseName:courseDisplayName(b.session.nameSnapshot)})),...backfills.flatMap(r=>Array.from({length:r.quantity},(_,i)=>({id:`${r.id}:${i}`,date:parseTaipeiDateTime(r.occurredOn!,'00:00')!.toISOString(),customerName:visible.get(r.customerId)!})))];
   if(completed.length>total)return unavailable('上課筆數與方案總堂數待核對，請查看完整紀錄。');
   completed.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
   return {success:true as const,data:{available:true as const,total,completed,shared:ids.length>1}};
  },{isolationLevel:'RepeatableRead'});
 }catch(error){const r=handleActionError(error);return {success:false as const,error:r.success?'讀取失敗，請重試':r.error};}
}
