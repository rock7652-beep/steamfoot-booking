import type {browseCourseCards} from '@/server/actions/course-browse';

/** Same read contract, without joining unrelated Server Actions' client queue. */
export async function readNativeCourseCards(input:unknown):Promise<Awaited<ReturnType<typeof browseCourseCards>>>{
 const prefix=window.location.pathname.split('/dashboard')[0];
 const response=await fetch(`${prefix}/dashboard/courses/card-read?args=${encodeURIComponent(JSON.stringify(input))}`,{credentials:'same-origin',cache:'no-store'});
 if(!response.ok)throw new Error('方案讀取失敗，請重試');
 return response.json();
}
