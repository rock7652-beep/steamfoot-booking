"use server";
import { z } from "zod";
import { courseManager } from "@/server/services/course-access";
import { coursePrisma } from "@/lib/course-db";
import { courseScheduleInput, buildCourseOccurrences } from "@/lib/course-scheduling";
import { formatTWDateTime, toLocalDateStr } from "@/lib/date-utils";
import { handleCourseActionError, assertCourseResources } from "@/server/services/course-resources";
import { assertCourseSessionsFitHours } from "@/server/services/course-business-hours";
import { assertMusicCourseAvailability } from "@/server/services/course-availability";
import { assertCourseDutyCoverage } from "@/server/services/course-duty";

/** Advisory only: createCourseSchedule repeats all checks under the store transaction lock. */
export async function inspectCourseSchedule(input:unknown) {
  try {
    const {storeId}=await courseManager("booking.create");
    const data=courseScheduleInput.extend({learners:z.array(z.object({customerId:z.string().min(1).max(100)})).max(500).default([])}).parse(input);
    const occurrences=buildCourseOccurrences(data);
    await assertCourseResources(coursePrisma,storeId,data);
    const ranges=occurrences.map(range=>({startsAt:{lt:range.endsAt},endsAt:{gt:range.startsAt}}));
    const [sessions,bookings]=await Promise.all([
      coursePrisma.courseSession.findMany({where:{storeId,cancelledAt:null,releasedAt:null,AND:[{OR:[{roomId:data.roomId},{coachId:data.coachId}]},{OR:ranges}]},select:{startsAt:true,endsAt:true,roomId:true}}),
      data.learners.length?coursePrisma.courseBooking.findMany({where:{storeId,customerId:{in:data.learners.map(row=>row.customerId)},status:{not:"CANCELLED"},session:{cancelledAt:null,releasedAt:null,OR:ranges}},select:{customerName:true,session:{select:{startsAt:true,endsAt:true}}}}):Promise.resolve([]),
    ]);
    const issues: {date:string;reason:string}[]=[];
    for(const range of occurrences){
      const date=toLocalDateStr(range.startsAt);
      const conflicts=sessions.filter(s=>s.startsAt<range.endsAt&&s.endsAt>range.startsAt);
      for(const s of conflicts)issues.push({date,reason:`${formatTWDateTime(s.startsAt).slice(11)} ${s.roomId===data.roomId?"教室":"老師"}已有課`});
      for(const b of bookings.filter(b=>b.session.startsAt<range.endsAt&&b.session.endsAt>range.startsAt))issues.push({date,reason:`${b.customerName}同時段已有課`});
      try {
        await assertCourseSessionsFitHours(coursePrisma,storeId,[range]);
        await assertMusicCourseAvailability(coursePrisma,storeId,data.coachId,[range]);
        await assertCourseDutyCoverage(coursePrisma,storeId,[{...range,coachId:data.coachId}]);
      }catch(error){issues.push({date,reason:handleCourseActionError(error).error??"此時段無法完整排入"});}
    }
    return {success:true as const,issues};
  }catch(error){return {success:false as const,error:handleCourseActionError(error).error??"時段檢查失敗"};}
}
