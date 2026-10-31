import "server-only";
import {coursePrisma} from "@/lib/course-db";
import {memoizeCourseReadRequest} from "@/server/services/course-read-request-memo";

/** Shared session metadata for the detail, waitlist and balance readers.
 * Financial rows remain independent live queries; no cross-request cache. */
export function readCourseSessionDetail(storeId:string,sessionId:string){
  return memoizeCourseReadRequest(coursePrisma,JSON.stringify(["session",storeId,sessionId]),()=>coursePrisma.courseSession.findFirst({
    relationLoadStrategy:"join",
    where:{id:sessionId,storeId},
    select:{id:true,chargeSnapshot:true,startsAt:true,templateId:true,pointCost:true,teacherNote:true,teacherAttendance:true,teacherAttendanceReason:true,teacherMakeupForSessionId:true,template:{select:{musicSubjectId:true,waitlistStopMinutes:true,waitlistEnabled:true,waitlistLimit:true}}},
  }));
}
