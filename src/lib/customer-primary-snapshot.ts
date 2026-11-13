import type {CourseCardsReadResult} from './course-card-read-client';
import type {loadCourseCustomerBookings} from '@/server/actions/course-members';
import type {loadMusicStudentWorkspace} from '@/server/actions/music-student-workspace';
export type CustomerPrimaryInput={customerId:string;storeId:string;dataScope?:'operational'|'legacy';cards:boolean;bookings:boolean;music:boolean};
export type CustomerPrimarySnapshot={success:true;cards?:CourseCardsReadResult;next?:Awaited<ReturnType<typeof loadCourseCustomerBookings>>;musicOverview?:Awaited<ReturnType<typeof loadMusicStudentWorkspace>>;phone?:Awaited<ReturnType<typeof import('@/server/actions/course-phone-view').loadCoursePhoneConnection>>;makeups?:Awaited<ReturnType<typeof import('@/server/actions/music-student-makeups').loadMusicStudentMakeups>>;beautyProgress?:Array<{cardId:string;result:Awaited<ReturnType<typeof import('@/server/actions/beauty-native-customers').readBeautyNativeCardProgress>>}>}|{success:false;error:string};
export async function readCustomerPrimary(input:CustomerPrimaryInput):Promise<CustomerPrimarySnapshot>{
 const prefix=window.location.pathname.split('/dashboard')[0];
 const response=await fetch(`${prefix}/dashboard/courses/customer-overview-read?args=${encodeURIComponent(JSON.stringify(input))}`,{credentials:'same-origin',cache:'no-store'});
 const result=await response.json();if(!response.ok||typeof result?.success!=='boolean')throw Error('顧客資料讀取失敗，請重試');return result;
}
