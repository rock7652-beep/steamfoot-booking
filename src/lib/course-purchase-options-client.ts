import type {loadCourseStudentPurchase} from '@/server/actions/course-members';

/** Read-only transport: independent of the Server Action mutation queue. */
export async function readCoursePurchaseOptions(bookingId:string):Promise<Awaited<ReturnType<typeof loadCourseStudentPurchase>>>{
 const prefix=window.location.pathname.split('/dashboard')[0];
 const response=await fetch(`${prefix}/dashboard/courses/purchase-options?bookingId=${encodeURIComponent(bookingId)}`,{credentials:'same-origin',cache:'no-store'});
 if(!response.ok)throw new Error('方案讀取失敗，請關閉後重試');
 return response.json();
}
