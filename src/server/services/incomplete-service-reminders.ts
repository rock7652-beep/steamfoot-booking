import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { toLocalDateStr, formatTWDateTime, parseTaipeiDateTime,dayRange } from "@/lib/date-utils";
import { notifyStoreManagerOnLine } from "@/server/services/store-manager-line-notifications";
import {recordDigitalManagerNotice,resolveDigitalManagerNotice} from "@/server/services/digital-manager-notices";
import {hasStoreFeature} from "@/lib/feature-gate";
import {FEATURES} from "@/lib/feature-flags";

const SERVICE_DURATION_MINUTES = 60;
const REMINDER_GRACE_MINUTES = 60;
const LOOKBACK_DAYS = 2;

function bookingStartAtTaipei(bookingDate: Date, slotTime: string): Date | null {
  const match = /^(\d{2}):(\d{2})$/.exec(slotTime);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return parseTaipeiDateTime(bookingDate.toISOString().slice(0, 10), slotTime);
}

function reminderDueAt(bookingDate: Date, slotTime: string): Date | null {
  const start = bookingStartAtTaipei(bookingDate, slotTime);
  return start
    ? new Date(start.getTime() + (SERVICE_DURATION_MINUTES + REMINDER_GRACE_MINUTES) * 60 * 1000)
    : null;
}

async function claimNotification(storeId: string, eventKey: string): Promise<string | null> {
  try {
    const claim = await prisma.digitalButlerExecutionLog.create({
      data: {
        storeId,
        eventKey,
        eventType: "INCOMPLETE_SERVICE_REMINDER",
        outcome: "CLAIMED",
      },
      select: { id: true },
    });
    return claim.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
    throw error;
  }
}

async function releaseClaim(claimId: string): Promise<void> {
  await prisma.digitalButlerExecutionLog.delete({ where: { id: claimId } }).catch(() => undefined);
}

export interface IncompleteServiceReminderResult {
  scanned: number;
  due: number;
  sent: number;
  skipped: number;
  failed: number;
}

type IncompleteCandidate={id:string;storeId:string;bookingDate:Date;slotTime:string;customer:{name:string};store:{slug:string};courseSessionId:string|null;courseEndsAt:Date|null};
/** New store reminders are scanned independently from the legacy LINE retry batches. */
export async function getUnrecordedSteamIncomplete(earliest:Date,latest:Date){
 return prisma.$queryRaw<IncompleteCandidate[]>`SELECT b.id,b."storeId",b."bookingDate",b."slotTime",jsonb_build_object('name',c.name) AS customer,jsonb_build_object('slug',s.slug) AS store,NULL::text AS "courseSessionId",NULL::timestamptz AS "courseEndsAt"
 FROM public."Booking" b JOIN public."Store" s ON s.id=b."storeId" JOIN public."Customer" c ON c.id=b."customerId" AND c."storeId"=b."storeId"
 WHERE b."bookingDate">=${earliest}::date AND b."bookingDate"<${latest}::date AND b."bookingStatus"::text IN ('PENDING','CONFIRMED') AND s."industryModule"::text='STEAMFOOT' AND s."isDemo"=false AND s."operatingStatus"::text IN ('ACTIVE','TRIAL')
 AND NOT EXISTS(SELECT 1 FROM public."DigitalManagerNotice" n WHERE n."storeId"=b."storeId" AND n."eventKey"='incomplete-service-reminder:'||b.id||':'||to_char(b."bookingDate",'YYYY-MM-DD')||':'||b."slotTime")
 ORDER BY b."bookingDate",b."slotTime",b.id LIMIT 300`;
}
export async function getUnrecordedCourseIncomplete(now:Date){
 const earliest=new Date(dayRange(toLocalDateStr(now)).start.getTime()-2*24*60*60*1000),due=new Date(now.getTime()-60*60*1000);
 return prisma.$queryRaw<IncompleteCandidate[]>`SELECT b.id,b."storeId",(s."startsAt" AT TIME ZONE 'Asia/Taipei')::date AS "bookingDate",to_char(s."startsAt" AT TIME ZONE 'Asia/Taipei','HH24:MI') AS "slotTime",jsonb_build_object('name',b."customerName") AS customer,jsonb_build_object('slug',st.slug) AS store,b."sessionId" AS "courseSessionId",s."endsAt" AS "courseEndsAt"
 FROM public."CourseBooking" b JOIN public."CourseSession" s ON s.id=b."sessionId" AND s."storeId"=b."storeId" JOIN public."Store" st ON st.id=b."storeId"
 WHERE b.status::text='RESERVED' AND s."cancelledAt" IS NULL AND s."startsAt">=${earliest} AND s."endsAt"<=${due} AND st."industryModule"::text='COURSE' AND st."isDemo"=false AND st."operatingStatus"::text IN ('ACTIVE','TRIAL')
 AND NOT EXISTS(SELECT 1 FROM public."DigitalManagerNotice" n WHERE n."storeId"=b."storeId" AND n."eventKey"='course-incomplete-attendance:'||b.id||':'||to_char(s."endsAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
 ORDER BY s."startsAt",b.id LIMIT 300`;
}

export async function runIncompleteServiceReminders(now = new Date()): Promise<IncompleteServiceReminderResult> {
  const todayTW = toLocalDateStr(now);
  const [year, month, day] = todayTW.split("-").map(Number);
  const earliestBookingDate = new Date(Date.UTC(year, month - 1, day - LOOKBACK_DAYS));
  const latestBookingDate = new Date(Date.UTC(year, month - 1, day + 1));

  const steamfootQuery = prisma.booking.findMany({
    where: {
      bookingDate: { gte: earliestBookingDate, lt: latestBookingDate },
      bookingStatus: { in: ["PENDING", "CONFIRMED"] },
      store: {
        industryModule: "STEAMFOOT",
        isDemo: false,
        operatingStatus: { in: ["ACTIVE", "TRIAL"] },
      },
    },
    select: {
      id: true,
      storeId: true,
      bookingDate: true,
      slotTime: true,
      customer: { select: { name: true } },
      store: { select: { slug: true } },
    },
    orderBy: [{ bookingDate: "asc" }, { slotTime: "asc" }],
    take: 300,
  });
  let steamfootCandidates:Awaited<typeof steamfootQuery>=[];
  let steamQueryFailed=false;
  try{steamfootCandidates=await steamfootQuery;}catch{steamQueryFailed=true;console.error('[IncompleteServiceReminder] steam candidates failed');}

  const { getIncompleteCourseCandidates, isCourseBookingStillIncomplete } = await import("@/server/queries/course-manager-todos");
  let courseCandidates: Awaited<ReturnType<typeof getIncompleteCourseCandidates>> = [];
  let courseQueryFailed = false;
  try {
    courseCandidates = await getIncompleteCourseCandidates(now,{includeWithoutLine:true});
  } catch (error) {
    courseQueryFailed = true;
    console.error("[IncompleteServiceReminder] course candidates failed", { error: error instanceof Error ? error.message : "Unknown error" });
  }
  const unrecorded=await Promise.allSettled([getUnrecordedSteamIncomplete(earliestBookingDate,latestBookingDate),getUnrecordedCourseIncomplete(now)]);
  const unrecordedFailed=unrecorded.filter(result=>result.status==='rejected').length;
  if(unrecordedFailed)console.error('[IncompleteServiceReminder] unrecorded candidate query failed');
  const key=(item:IncompleteCandidate)=>JSON.stringify([item.courseSessionId?'course':'steam',item.storeId,item.id]);
  const lineCandidates=[
    ...steamfootCandidates.map(candidate => ({ ...candidate, courseSessionId: null as string | null, courseEndsAt: null as Date | null })),
    ...courseCandidates.map(candidate => ({ id: candidate.id, storeId: candidate.storeId, bookingDate: new Date(`${toLocalDateStr(candidate.session.startsAt)}T00:00:00Z`), slotTime: formatTWDateTime(candidate.session.startsAt).slice(11), customer: { name: candidate.customerName }, store: { slug: candidate.storeSlug }, courseSessionId: candidate.sessionId, courseEndsAt: candidate.session.endsAt })),
  ];
  const lineCandidateKeys=new Set(lineCandidates.map(key));
  const candidates = [...new Map([
    ...unrecorded.flatMap(result=>result.status==='fulfilled'?result.value:[]),
    ...lineCandidates,
  ].map(item=>[key(item),item])).values()];

  const result: IncompleteServiceReminderResult = {
    scanned: candidates.length,
    due: 0,
    sent: 0,
    skipped: 0,
    failed: (courseQueryFailed ? 1 : 0)+(steamQueryFailed ? 1 : 0)+unrecordedFailed,
  };

  for (const candidate of candidates) {
    const dueAt = candidate.courseEndsAt ? new Date(candidate.courseEndsAt.getTime() + REMINDER_GRACE_MINUTES * 60 * 1000) : reminderDueAt(candidate.bookingDate, candidate.slotTime);
    if (!dueAt || dueAt.getTime() > now.getTime()) {
      result.skipped += 1;
      continue;
    }
    result.due += 1;

    const eventKey = `${candidate.courseSessionId ? "course-incomplete-attendance" : "incomplete-service-reminder"}:${candidate.id}`;
    const digitalEventKey=candidate.courseEndsAt?`${eventKey}:${candidate.courseEndsAt.toISOString()}`:`${eventKey}:${candidate.bookingDate.toISOString().slice(0,10)}:${candidate.slotTime}`;
    const stillMatches=()=>candidate.courseSessionId && candidate.courseEndsAt
      ? isCourseBookingStillIncomplete(candidate.storeId,candidate.id,now,{sessionId:candidate.courseSessionId,endsAt:candidate.courseEndsAt})
      : prisma.booking.findFirst({where:{id:candidate.id,storeId:candidate.storeId,bookingStatus:{in:["PENDING","CONFIRMED"]},bookingDate:candidate.bookingDate,slotTime:candidate.slotTime},select:{id:true}});
    let claimId: string | null = null;
    try {
      // Recheck the business event before independently recording the store notice.
      const stillIncomplete = await stillMatches();
      if (!stillIncomplete) {
        result.skipped += 1;
        continue;
      }
      await recordDigitalManagerNotice(prisma,{storeId:candidate.storeId,eventKey:digitalEventKey,eventType:"INCOMPLETE_SERVICE_REMINDER",targetId:candidate.id});
      // A reschedule or completion can happen before the notice is inserted,
      // after the database trigger has already run. Recheck before every exit.
      if(!await stillMatches()){
        await resolveDigitalManagerNotice(prisma,{storeId:candidate.storeId,eventKey:digitalEventKey,actorUserId:'system',actorName:'系統'});
        result.skipped+=1;continue;
      }
      if(!lineCandidateKeys.has(key(candidate))){result.skipped+=1;continue;}
      if(candidate.courseSessionId&&!await hasStoreFeature(candidate.storeId,FEATURES.LINE_REMINDER)){result.skipped+=1;continue;}
      claimId = await claimNotification(candidate.storeId, eventKey);
      if (!claimId) { result.skipped += 1; continue; }
      // A completion can win between the first check and the outbound claim.
      const stillDue=await stillMatches();
      if(!stillDue){await resolveDigitalManagerNotice(prisma,{storeId:candidate.storeId,eventKey:digitalEventKey,actorUserId:'system',actorName:'系統'});result.skipped+=1;await releaseClaim(claimId);continue;}

      const delivery = await notifyStoreManagerOnLine({
        type: "INCOMPLETE_SERVICE_REMINDER",
        eventKey,
        storeId: candidate.storeId,
        storeSlug: candidate.store.slug,
        bookingId: candidate.id,
        customerName: candidate.customer.name,
        bookingDate: candidate.bookingDate.toISOString().slice(0, 10),
        slotTime: candidate.slotTime,
        ...(candidate.courseSessionId ? { courseSessionId: candidate.courseSessionId } : {}),
      });

      if (delivery.status === "sent") {
        result.sent += 1;
        if (delivery.failedCount > 0) result.failed += 1;
        await prisma.digitalButlerExecutionLog.update({
          where: { id: claimId },
          data: { outcome: delivery.failedCount > 0 ? "PARTIAL" : "SENT" },
        });
      } else if (delivery.status === "skipped") {
        result.skipped += 1;
        await releaseClaim(claimId);
      } else {
        result.failed += 1;
        await releaseClaim(claimId);
      }
    } catch (error) {
      result.failed += 1;
      if (claimId) await releaseClaim(claimId);
      console.error("[IncompleteServiceReminder] booking failed", {
        bookingId: candidate.id,
        storeId: candidate.storeId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return result;
}
