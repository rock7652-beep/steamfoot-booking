import "server-only";
import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { courseDutyIntervals, dutyCoversCourse } from "@/lib/course-duty";
import type { Hour, Special } from "@/lib/course-business-hours";
import { formatTWDateTime, toLocalDateStr } from "@/lib/date-utils";

// Both Prisma clients share the same database; accept only their raw-query API.
type Reader = Pick<Prisma.TransactionClient, "$queryRaw">;
type Session = { startsAt: Date; endsAt: Date; coachId: string; nameSnapshot?: string };

export async function assertCourseDutyCoverage(tx: Reader, storeId: string, sessions?: Session[]) {
  const config = await tx.$queryRaw<{dutySchedulingEnabled:boolean}[]>`
    SELECT "dutySchedulingEnabled" FROM "ShopConfig" WHERE "storeId"=${storeId}`;
  if (!config[0]?.dutySchedulingEnabled) return;
  const classes = sessions ?? await tx.$queryRaw<Session[]>`
    SELECT "startsAt", "endsAt", "coachId", "nameSnapshot" FROM "CourseSession"
    WHERE "storeId"=${storeId} AND "cancelledAt" IS NULL AND "endsAt">NOW()
    ORDER BY "startsAt"`;
  if (!classes.length) return;
  const [hours, specials, assignments] = await Promise.all([
    tx.$queryRaw<Hour[]>`SELECT * FROM "BusinessHours" WHERE "storeId"=${storeId}`,
    tx.$queryRaw<Special[]>`SELECT * FROM "SpecialBusinessDay" WHERE "storeId"=${storeId}`,
    tx.$queryRaw<{date:Date;slotTime:string;staffId:string}[]>`
      SELECT date,"slotTime","staffId" FROM "DutyAssignment" WHERE "storeId"=${storeId}`,
  ]);
  const conflicts = classes.filter(session => {
    const date = toLocalDateStr(session.startsAt);
    return date !== toLocalDateStr(session.endsAt) || !dutyCoversCourse(
      formatTWDateTime(session.startsAt).slice(11), formatTWDateTime(session.endsAt).slice(11),
      courseDutyIntervals(date, hours, specials),
      assignments.filter(a=>a.staffId===session.coachId && a.date.toISOString().slice(0,10)===date).map(a=>a.slotTime),
    );
  });
  if (conflicts.length) throw new AppError("VALIDATION", `教練值班未涵蓋完整課程時段：${conflicts.map(s=>`${formatTWDateTime(s.startsAt)}–${formatTWDateTime(s.endsAt).slice(11)} ${s.nameSnapshot??"課程"}`).join("；")}。本批尚未儲存，請先調整值班或排課。`);
}

