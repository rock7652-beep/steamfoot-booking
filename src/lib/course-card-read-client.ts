import type {browseCourseCards} from '@/server/actions/course-browse';

/** Same read contract, without joining unrelated Server Actions' client queue. */
export type CourseCardsReadResult = Awaited<ReturnType<typeof browseCourseCards>> & {
 progress?: Array<{cardId:string;result:Awaited<ReturnType<typeof import('@/server/actions/course-card-progress').loadCourseCardProgress>>}>;
};
export async function readNativeCourseCards(input:unknown,progressStoreId?:string):Promise<CourseCardsReadResult>{
 const prefix=window.location.pathname.split('/dashboard')[0];
 const progress=progressStoreId?`&progressStoreId=${encodeURIComponent(progressStoreId)}`:'';
 const response=await fetch(`${prefix}/dashboard/courses/card-read?args=${encodeURIComponent(JSON.stringify(input))}${progress}`,{credentials:'same-origin',cache:'no-store'});
 if(!response.ok)throw new Error('方案讀取失敗，請重試');
 return response.json();
}

/** Same authorization/progress projection as the action, outside the action queue. */
export async function readCourseCardProgress(input:unknown):Promise<Awaited<ReturnType<typeof import('@/server/actions/course-card-progress').loadCourseCardProgress>>>{
 const prefix=window.location.pathname.split('/dashboard')[0];
 const response=await fetch(`${prefix}/dashboard/courses/card-progress-read?args=${encodeURIComponent(JSON.stringify(input))}`,{credentials:'same-origin',cache:'no-store'});
 if(!response.ok)throw new Error('上課進度讀取失敗，請重試');
 return response.json();
}
