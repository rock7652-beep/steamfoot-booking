"use server";
import {revalidatePath} from 'next/cache';
import {beautyNativeScheduleInput} from '@/lib/beauty/native-schedule';
import {AppError,handleActionError} from '@/lib/errors';
import {beautyManager,beautyTransaction} from '@/server/beauty/access';
import {reserveNativeBeautySchedule} from '@/server/beauty/native-schedule';
import {requirePermission} from '@/lib/permissions';
import {requireStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {saveCourseRental} from './course-rental';

/** No Course booking or ledger action is used for Beauty services. */
export async function scheduleNativeBeautyService(input:unknown){
 try{
  const a=await beautyManager('booking.create',true);
  await requirePermission('customer.read');
  const d=beautyNativeScheduleInput.parse(input),p=d.payload;
  if(p.kind==='空間出租'){
   if(!p.customerId)throw new AppError('VALIDATION','請選擇租借顧客');
   const rooms=await beautyTransaction(a,tx=>tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "CourseRoom" WHERE "storeId"=${a.storeId} AND name=${p.room} AND "isActive"=true AND "rentalEnabled"=true`);
   if(rooms.length!==1)throw new AppError('VALIDATION','租借位置不存在或名稱重複');
   const r=await saveCourseRental({requestKey:p.requestKey,roomId:rooms[0].id,date:p.date,time:p.time,durationMinutes:p.duration,amount:p.price,customerId:p.customerId,customerName:p.customer,customerPhone:p.phone,note:''},'beauty');
   if(!r.success)return r;
  }else{
   if(p.kind!=='體驗')await requireStoreFeature(a.storeId,FEATURES.PLAN_MANAGEMENT);
   await beautyTransaction(a,tx=>reserveNativeBeautySchedule(tx,a,d));
  }
  revalidatePath('/dashboard/beauty');
  return {success:true as const};
 }catch(error){return handleActionError(error);}
}
