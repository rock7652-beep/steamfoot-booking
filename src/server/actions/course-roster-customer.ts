"use server";
import {z} from 'zod';
import {readCourseCards} from '@/server/queries/course-card-browser';
import {loadCourseCardProgress} from '@/server/actions/course-card-progress';
import {coursePrisma} from '@/lib/course-db';
import {courseManager} from '@/server/services/course-access';
import {loadCourseMemberWorkspace} from '@/server/queries/course-member-workspace';
import {handleActionError,AppError} from '@/lib/errors';
export async function loadCourseRosterCustomer(input:unknown){
 try{
  const d=z.object({customerId:z.string().min(1).max(100),sessionId:z.string().min(1).max(100),cardId:z.string().min(1).max(100).optional(),expectedStoreId:z.string().min(1).max(100).optional(),dataScope:z.enum(['operational','legacy']).optional()}).parse(input);
  const {storeId}=await courseManager('booking.read');
  if(d.expectedStoreId&&storeId!==d.expectedStoreId)throw new AppError('CONFLICT','店家已切換，請重新開啟學員資料');
  const booking=await coursePrisma.courseBooking.findFirst({where:{storeId,sessionId:d.sessionId,customerId:d.customerId,...(d.cardId?{cardId:d.cardId}:{})},select:{id:true}});
  if(!booking)throw new AppError('NOT_FOUND','找不到本課堂學員');
  const [data,detail,progress]=await Promise.all([
   loadCourseMemberWorkspace('customers',{customerId:d.customerId,dataScope:d.dataScope},true),
   d.cardId?readCourseCards({cardId:d.cardId,dataScope:d.dataScope}):Promise.resolve(null),
   d.cardId?loadCourseCardProgress({cardId:d.cardId,customerId:d.customerId,expectedStoreId:storeId,dataScope:d.dataScope}):Promise.resolve(null),
  ]);
  if(data.storeId!==storeId)throw new AppError('CONFLICT','店家已切換，請重新開啟學員資料');
  return {success:true as const,data:{...data,workspaceProps:{...data.workspaceProps,initialCardRead:detail?.success&&detail.rows[0]?{card:detail.rows[0],progress:progress??undefined}:undefined}}};
 }catch(error){const r=handleActionError(error);return {success:false as const,error:r.success?'讀取失敗':r.error};}
}
