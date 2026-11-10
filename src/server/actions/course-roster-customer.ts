"use server";
import {z} from 'zod';
import {coursePrisma} from '@/lib/course-db';
import {courseManager} from '@/server/services/course-access';
import {loadCourseMemberWorkspace} from '@/server/queries/course-member-workspace';
import {handleActionError,AppError} from '@/lib/errors';
export async function loadCourseRosterCustomer(input:unknown){
 try{
  const d=z.object({customerId:z.string().min(1).max(100),sessionId:z.string().min(1).max(100),expectedStoreId:z.string().min(1).max(100).optional(),dataScope:z.enum(['operational','legacy']).optional()}).parse(input);
  const {storeId}=await courseManager('booking.read');
  if(d.expectedStoreId&&storeId!==d.expectedStoreId)throw new AppError('CONFLICT','店家已切換，請重新開啟學員資料');
  const booking=await coursePrisma.courseBooking.findFirst({where:{storeId,sessionId:d.sessionId,customerId:d.customerId},select:{id:true}});
  if(!booking)throw new AppError('NOT_FOUND','找不到本課堂學員');
  const data=await loadCourseMemberWorkspace('customers',{customerId:d.customerId,dataScope:d.dataScope},true);
  if(data.storeId!==storeId)throw new AppError('CONFLICT','店家已切換，請重新開啟學員資料');
  return {success:true as const,data};
 }catch(error){const r=handleActionError(error);return {success:false as const,error:r.success?'讀取失敗':r.error};}
}
