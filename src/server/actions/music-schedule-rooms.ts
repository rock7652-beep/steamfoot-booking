"use server";
import {z} from "zod";
import {courseManager} from "@/server/services/course-access";
import {coursePrisma} from "@/lib/course-db";
import {parseTaipeiDateTime} from "@/lib/date-utils";
import {findFixedSeriesConflicts} from "@/lib/course-series";
import {handleActionError,AppError} from "@/lib/errors";

export async function getMusicScheduleRooms(input:unknown) {
  try{
    const {storeId}=await courseManager("booking.read");
    const data=z.object({date:z.string(),time:z.string(),durationMinutes:z.number().int().min(1).max(480)}).parse(input);
    const startsAt=parseTaipeiDateTime(data.date,data.time);
    if(!startsAt)throw new AppError("VALIDATION","請選擇有效日期與時間");
    const endsAt=new Date(startsAt.getTime()+data.durationMinutes*60_000);
    const [rooms,sessions,rentals,rules]=await Promise.all([
      coursePrisma.courseRoom.findMany({where:{storeId,isActive:true},select:{id:true},orderBy:{name:"asc"}}),
      coursePrisma.courseSession.findMany({where:{storeId,cancelledAt:null,releasedAt:null,startsAt:{lt:endsAt},endsAt:{gt:startsAt}},select:{roomId:true}}),
      coursePrisma.courseRental.findMany({where:{storeId,cancelledAt:null,occupiedStartsAt:{lt:endsAt},occupiedEndsAt:{gt:startsAt}},select:{roomId:true}}),
      coursePrisma.courseScheduleSeries.findMany({where:{storeId,cancelledAt:null}}),
    ]);
    return {success:true as const,roomIds:rooms.filter(room=>!sessions.some(row=>row.roomId===room.id)&&!rentals.some(row=>row.roomId===room.id)&&!findFixedSeriesConflicts(rules,[{startsAt,endsAt}],{roomId:room.id,coachId:""}).length).map(room=>room.id)};
  }catch(error){const failure=handleActionError(error);return {success:false as const,error:failure.success?"可用教室讀取失敗":failure.error};}
}
