import type {OperationTiming} from '@/lib/operation-timing';
import 'server-only';
import {readCourseCards} from './course-card-browser';
import {readCourseCardProgressBatch} from '@/server/services/course-card-progress-batch';
import {loadCourseCustomerBookings} from '@/server/actions/course-members';
import {loadMusicStudentWorkspace} from '@/server/actions/music-student-workspace';
import {z} from 'zod';
import {loadCoursePhoneConnection} from '@/server/actions/course-phone-view';
import {loadMusicStudentMakeups} from '@/server/actions/music-student-makeups';

export const customerOverviewInput=z.object({customerId:z.string().min(1).max(100),storeId:z.string().min(1).max(100),dataScope:z.enum(['operational','legacy']).optional(),cards:z.boolean(),bookings:z.boolean(),music:z.boolean()});
/** Independent authorized readers run together; the browser receives one primary snapshot. */
export async function readCourseCustomerOverview(input:unknown,timing?:Pick<OperationTiming,'measure'>){
 const measure=<T>(name:string,work:()=>Promise<T>)=>timing?timing.measure(name,work):work();
 const d=customerOverviewInput.parse(input);
 const cards=async()=>{
  if(!d.cards)return undefined;
  const result=await measure('cards',()=>readCourseCards({customerId:d.customerId,dataScope:d.dataScope,search:'',history:false,page:0},false,undefined,true));
  if(!result.success)return result;
  const progress=d.bookings?await measure('progress',()=>readCourseCardProgressBatch({cardIds:result.rows.map(c=>c.id),customerId:d.customerId,expectedStoreId:d.storeId,dataScope:d.dataScope})):undefined;
  return {...result,progress};
 };
 const [plans,next,musicOverview,phone,makeups]=await Promise.all([cards(),d.bookings&&!d.music?measure('next',()=>loadCourseCustomerBookings(d.customerId,0,{mode:'upcoming'})):undefined,d.music&&d.dataScope!=='legacy'&&(d.cards||d.bookings)?measure('music_overview',()=>loadMusicStudentWorkspace(d.customerId,false)):undefined,measure('phone',()=>loadCoursePhoneConnection(d.customerId)),d.music&&d.cards&&d.bookings?measure('makeups',()=>loadMusicStudentMakeups(d.customerId,d.dataScope)):undefined]);
 return {success:true as const,cards:plans,next,musicOverview,phone,makeups};
}
