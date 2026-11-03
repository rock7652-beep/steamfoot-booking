import type {loadCourseRosterQuick} from '@/server/actions/course-members';
/** A committed purchase's independently authorized, current roster projection. */
export type CoursePurchaseRosterSnapshot={
 sessionId:string;
 data:Extract<Awaited<ReturnType<typeof loadCourseRosterQuick>>,{success:true}>['data'];
};

export type CoursePurchaseCardsSnapshot={customerId:string;result:Extract<Awaited<ReturnType<typeof import('@/server/queries/course-card-browser').readCourseCards>>,{success:true}>};
