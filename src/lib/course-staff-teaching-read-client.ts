import type {readCourseStaffTeaching} from '@/server/actions/course-staff';
/** Permission-checked read outside the browser Server Action queue. */
export const readNativeCourseStaffTeaching:typeof readCourseStaffTeaching=async staffId=>{
 const prefix=window.location.pathname.split('/dashboard')[0];
 const response=await fetch(`${prefix}/dashboard/courses/staff-teaching-read?staffId=${encodeURIComponent(staffId)}`,{credentials:'same-origin',cache:'no-store'});
 if(!response.ok)throw new Error('授課設定讀取失敗，請重試');
 return response.json();
};
