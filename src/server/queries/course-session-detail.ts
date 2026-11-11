import "server-only";
import {courseCalendarRead} from "@/server/services/course-calendar-read-scope";
import {coursePrisma} from "@/lib/course-db";
import {memoizeCourseReadRequest} from "@/server/services/course-read-request-memo";

const SESSION_SELECT={id:true,coachId:true,enrollmentMode:true,bookingAudience:true,chargeSnapshot:true,startsAt:true,templateId:true,requestKey:true,requestIndex:true,pointCost:true,teacherNote:true,teacherAttendance:true,teacherAttendanceReason:true,teacherMakeupForSessionId:true,template:{select:{classType:true,musicTermLessons:true,musicSubjectId:true,musicSubject:{select:{isActive:true}},waitlistStopMinutes:true,waitlistEnabled:true,waitlistLimit:true}}} as const;

/** Shared session metadata for the detail, waitlist and balance readers.
 * Financial rows remain independent live queries; no cross-request cache. */
export function readCourseSessionDetail(storeId:string,sessionId:string){
  const calendar=courseCalendarRead(coursePrisma,storeId,sessionId);
  if(calendar)return calendar.once('sessions',()=>coursePrisma.courseSession.findMany({relationLoadStrategy:'join',where:{storeId,id:{in:[...calendar.sessionIds]}},select:SESSION_SELECT})).then(rows=>rows.find(row=>row.id===sessionId)??null);
  return memoizeCourseReadRequest(coursePrisma,JSON.stringify(["session",storeId,sessionId]),()=>coursePrisma.courseSession.findFirst({
    relationLoadStrategy:"join",
    where:{id:sessionId,storeId},
    select:SESSION_SELECT,
  }));
}
