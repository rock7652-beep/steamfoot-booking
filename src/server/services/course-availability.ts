import "server-only";
import type { Prisma } from "../../../generated/course-client";
import { AppError } from "@/lib/errors";
import { COURSE_DURATION_OPTIONS, normalizeAvailabilityPeriods, periodContains } from "@/lib/course-availability";
import { formatTWDateTime, toLocalDateStr } from "@/lib/date-utils";

type Reader=Pick<Prisma.TransactionClient,"$queryRaw">;
type SessionRange={startsAt:Date;endsAt:Date};

async function isMusicCourseStore(tx:Reader,storeId:string) {
  const music=await tx.$queryRaw<{featureKey:string}[]>`
    SELECT "featureKey" FROM "StoreFeatureEntitlement"
    WHERE "storeId"=${storeId} AND "featureKey"='business.music' AND status::text='ENABLED' LIMIT 1`;
  return music.length>0;
}

export async function assertMusicCourseDuration(tx:Reader,storeId:string,durationMinutes:number) {
  if(!(await isMusicCourseStore(tx,storeId))) return;
  if(!(COURSE_DURATION_OPTIONS as readonly number[]).includes(durationMinutes)) {
    throw new AppError("VALIDATION","音樂教室課程時長限 30／60／90／120 分鐘");
  }
}

export async function assertMusicCourseAvailability(
  tx:Reader,
  storeId:string,
  staffId:string,
  sessions:SessionRange[],
) {
  if(!(await isMusicCourseStore(tx,storeId))) return;

  for(const session of sessions) {
    const duration=Math.round((session.endsAt.getTime()-session.startsAt.getTime())/60000);
    await assertMusicCourseDuration(tx,storeId,duration);
    const start=formatTWDateTime(session.startsAt).slice(11);
    if(!start.endsWith(":00")&&!start.endsWith(":30")) {
      throw new AppError("VALIDATION","音樂教室課程請從整點或半點開始");
    }
    const date=toLocalDateStr(session.startsAt);
    if(date!==toLocalDateStr(session.endsAt)) throw new AppError("VALIDATION","課程不可跨日");
    const dayOfWeek=new Date(date+"T00:00:00Z").getUTCDay();

    const [weekly,exception]=await Promise.all([
      tx.$queryRaw<{segments:unknown}[]>`
        SELECT segments FROM "CourseStaffAvailability"
        WHERE "storeId"=${storeId} AND "staffId"=${staffId} AND "dayOfWeek"=${dayOfWeek} LIMIT 1`,
      tx.$queryRaw<{type:string;segments:unknown}[]>`
        SELECT type,segments FROM "CourseStaffAvailabilityException"
        WHERE "storeId"=${storeId} AND "staffId"=${staffId} AND date=${new Date(date+"T00:00:00Z")}::date LIMIT 1`,
    ]);
    const hasCustomWeekly=(await tx.$queryRaw<{count:number}[]>`
      SELECT COUNT(*)::int AS count FROM "CourseStaffAvailability"
      WHERE "storeId"=${storeId} AND "staffId"=${staffId}`)[0]?.count>0;

    if(exception[0]?.type==="UNAVAILABLE") {
      throw new AppError("VALIDATION",`${date} 老師設定為不可授課，本堂尚未建立`);
    }
    let periods=exception[0]?.type==="CUSTOM"
      ? normalizeAvailabilityPeriods(exception[0].segments)
      : weekly.length
        ? normalizeAvailabilityPeriods(weekly[0].segments)
        : null;
    if(!periods&&hasCustomWeekly) periods=[];
    // No teacher-specific rows means "inherit store hours"; store-hours validation runs separately.
    if(periods&&!periodContains(periods,start,duration)) {
      throw new AppError("VALIDATION",`${date} ${start} 不在老師可授課時間內，本堂尚未建立`);
    }
  }
}
