import 'server-only';
import {prisma} from '@/lib/db';
import {memoizeReadRequest} from '@/server/services/read-request-memo';
import {isMusicCourseStoreFromEntitlements} from '@/server/services/course-business-profile';

/** Ordinary read client only; one current module lookup per explicit HTTP read.
 * Transaction/custom readers keep the separate uncached business-profile service. */
export function readCourseDetailMusicStore(storeId:string):Promise<boolean>{
 return memoizeReadRequest(JSON.stringify(['course.detail.music-store',storeId]),()=>isMusicCourseStoreFromEntitlements(prisma,storeId));
}
