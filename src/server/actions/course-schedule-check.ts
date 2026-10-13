"use server";
import { z } from "zod";
import { courseManager } from "@/server/services/course-access";
import { prisma } from "@/lib/db";
import { getManagerCustomerWhere } from "@/lib/manager-visibility";
import { coursePrisma } from "@/lib/course-db";
import { courseScheduleInput, buildCourseOccurrences } from "@/lib/course-scheduling";
import { formatTWDateTime, toLocalDateStr } from "@/lib/date-utils";
import { handleCourseActionError, assertCourseResources } from "@/server/services/course-resources";
import { findFixedSeriesConflicts, findOngoingFixedSeriesConflicts } from "@/lib/course-series";
import { assertCourseSessionsFitHours } from "@/server/services/course-business-hours";
import { assertMusicCourseAvailability } from "@/server/services/course-availability";
import { assertCourseDutyCoverage } from "@/server/services/course-duty";

/** Advisory only: createCourseSchedule repeats all checks under the store transaction lock. */
export async function inspectCourseSchedule(input:unknown) {
  try {
    const {storeId,user}=await courseManager("booking.create");
    const data=courseScheduleInput.extend({learners:z.array(z.object({customerId:z.string().min(1).max(100).nullable(),cardId:z.string().nullable().optional()})).max(500).default([])}).parse(input);
    if(data.enrollmentMode&&data.learners.some(row=>row.customerId)){
      await courseManager("customer.read");
      const ids=data.learners.flatMap(row=>row.customerId?[row.customerId]:[]);
      const count=await prisma.customer.count({where:{...getManagerCustomerWhere(user.role,user.staffId,storeId),storeId,id:{in:ids},mergedIntoCustomerId:null}});
      if(count!==new Set(ids).size)return {success:false as const,error:"請選擇有權限查看的本店學員"};
    }
    const occurrences=buildCourseOccurrences(data);
    const ongoing=data.scheduleType==="FIXED"&&data.enrollmentMode!==undefined;
    await assertCourseResources(coursePrisma,storeId,{...data,requireMusicSubject:!!data.enrollmentMode});
    const ranges=occurrences.map(range=>({startsAt:{lt:range.endsAt},endsAt:{gt:range.startsAt}}));
    const [sessions,bookings,fixedRules,rentals]=await Promise.all([
      coursePrisma.courseSession.findMany({where:{storeId,cancelledAt:null,releasedAt:null,AND:[{OR:[{roomId:data.roomId},{coachId:data.coachId}]},{...(ongoing?{endsAt:{gt:occurrences[0].startsAt}}:{OR:ranges})}]},select:{startsAt:true,endsAt:true,roomId:true,coachId:true}}),
      data.learners.length?coursePrisma.courseBooking.findMany({where:{storeId,customerId:{in:data.learners.map(row=>row.customerId).filter((id):id is string=>!!id)},status:{not:"CANCELLED"},session:{cancelledAt:null,releasedAt:null,OR:ranges}},select:{customerId:true,customerName:true,session:{select:{startsAt:true,endsAt:true}}}}):Promise.resolve([]),
      coursePrisma.courseScheduleSeries.findMany({where:{storeId,cancelledAt:null,...(ongoing?{}:{startsAt:{lt:occurrences[occurrences.length-1].endsAt}}),OR:[{untilDate:null},{untilDate:{gte:new Date(`${toLocalDateStr(occurrences[0].startsAt)}T00:00:00.000Z`)}}]}}),
      coursePrisma.courseRental.findMany({where:{storeId,roomId:data.roomId,cancelledAt:null,...(ongoing?{occupiedEndsAt:{gt:occurrences[0].startsAt}}:{OR:occurrences.map(range=>({occupiedStartsAt:{lt:range.endsAt},occupiedEndsAt:{gt:range.startsAt}}))})},select:{occupiedStartsAt:true,occupiedEndsAt:true}}),
    ]);
    const issues: {date:string;reason:string}[]=[];
    if(ongoing)issues.push(...findOngoingFixedSeriesConflicts({requestKey:data.requestKey,roomId:data.roomId,coachId:data.coachId,startsAt:occurrences[0].startsAt,endsAt:occurrences[0].endsAt,frequency:data.scheduleFrequency,untilDate:data.fixedUntil?new Date(`${data.fixedUntil}T00:00:00Z`):null,excludedDates:[],cancelledAt:null},fixedRules,[...sessions,...rentals.map(row=>({startsAt:row.occupiedStartsAt,endsAt:row.occupiedEndsAt,roomId:data.roomId}))]));
    issues.push(...findFixedSeriesConflicts(fixedRules,occurrences,{roomId:data.roomId,coachId:data.coachId},data.requestKey).map(({date,reason})=>({date,reason})));
    const dateIssues = await Promise.all(occurrences.map(async (range,index)=>{
      const issues: {date:string;reason:string}[]=[];
      const date=toLocalDateStr(range.startsAt);
      for(const rental of rentals.filter(row=>row.occupiedStartsAt<range.endsAt&&row.occupiedEndsAt>range.startsAt))issues.push({date,reason:`${formatTWDateTime(rental.occupiedStartsAt).slice(11)} 教室已有租借`});
      const conflicts=sessions.filter(s=>s.startsAt<range.endsAt&&s.endsAt>range.startsAt);
      for(const s of conflicts)issues.push({date,reason:`${formatTWDateTime(s.startsAt).slice(11)} ${s.roomId===data.roomId?"教室":"老師"}已有課`});
      for(const b of bookings.filter(b=>(index===0||data.learners.some(row=>row.customerId===b.customerId&&(row.cardId!==null||data.enrollmentMode==="ASSIGNED"&&!data.isTrial)))&&b.session.startsAt<range.endsAt&&b.session.endsAt>range.startsAt))issues.push({date,reason:`${b.customerName}同時段已有課`});
      try {
        await assertCourseSessionsFitHours(coursePrisma,storeId,[range]);
        await assertMusicCourseAvailability(coursePrisma,storeId,data.coachId,[range]);
        await assertCourseDutyCoverage(coursePrisma,storeId,[{...range,coachId:data.coachId}]);
      }catch(error){issues.push({date,reason:handleCourseActionError(error).error??"此時段無法完整排入"});}
      return issues;
    }));
    issues.push(...dateIssues.flat());
    return {success:true as const,issues};
  }catch(error){return {success:false as const,error:handleCourseActionError(error).error??"時段檢查失敗"};}
}
