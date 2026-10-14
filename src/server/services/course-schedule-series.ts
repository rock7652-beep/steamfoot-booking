import { assertCourseResources, handleCourseActionError } from "./course-resources";
import { assertCourseSessionsFitHours } from "./course-business-hours";
import { assertMusicCourseAvailability } from "./course-availability";
import { assertCourseDutyCoverage } from "./course-duty";
import { getStoreLimitsByStoreId } from "@/lib/feature-gate";
import { z } from "zod";
import { reserveScheduledMusicLearner } from "./music-schedule-enrollment";
import { coursePrisma } from "@/lib/course-db";
import { addTaiwanDuration, formatTWDateTime, toLocalDateStr } from "@/lib/date-utils";
import { buildNextFixedSeriesOccurrences, findFixedSeriesConflicts } from "@/lib/course-series";
import { kickCoachNotifications } from "@/server/services/course-coach-notification-kick";

const materializeDaysAhead = 365;

/** Materialize upcoming dates for the calendar; the series remains the durable reservation. */
export async function materializeCourseScheduleSeries() {
  const today = toLocalDateStr();
  const horizon = addTaiwanDuration(today, materializeDaysAhead, "DAY");
  const due = await coursePrisma.courseScheduleSeries.findMany({
    where: {
      cancelledAt: null,
      generatedThrough: { lt: new Date(`${horizon}T00:00:00.000Z`) },
      OR: [{ untilDate: null }, { untilDate: { gt: new Date(`${today}T00:00:00.000Z`) } }],
    },
    select: { id: true, storeId: true },
    take: 500,
  });
  const results = { checked: due.length, generated: 0, blocked: 0 };
  const changedStores = new Set<string>();

  for (const item of due) {
    try {
    const limits=await getStoreLimitsByStoreId(item.storeId);
    await coursePrisma.$transaction(async tx => {
      // The same store lock is used by all course schedule writers.
      const stores = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Store" WHERE id = ${item.storeId} AND "industryModule"::text = 'COURSE' FOR UPDATE
      `;
      if (!stores.length) return;
      const series = await tx.courseScheduleSeries.findFirst({ where: { id: item.id, storeId: item.storeId, cancelledAt: null } });
      if (!series) return;
      const ranges = buildNextFixedSeriesOccurrences(series, toLocalDateStr(series.generatedThrough), 4)
        .filter(range => toLocalDateStr(range.startsAt) <= horizon && (!series.untilDate || toLocalDateStr(range.startsAt) <= toLocalDateStr(series.untilDate)));
      if (!ranges.length) return;

      const first = ranges[0].startsAt;
      const last = ranges[ranges.length - 1].endsAt;
      const [sessions, rules, latest, rentals] = await Promise.all([
        tx.courseSession.findMany({
          where: { storeId: item.storeId, cancelledAt: null, releasedAt: null,
            startsAt: { lt: last }, endsAt: { gt: first },
            OR: [{ roomId: series.roomId }, { coachId: series.coachId }],
          },
          select: { startsAt: true, endsAt: true, roomId: true, coachId: true },
        }),
        tx.courseScheduleSeries.findMany({
          where: { storeId: item.storeId, cancelledAt: null, id: { not: series.id }, startsAt: { lt: last },
            OR: [{ untilDate: null }, { untilDate: { gte: new Date(`${toLocalDateStr(first)}T00:00:00.000Z`) } }],
          },
        }),
        tx.courseSession.findFirst({ where: { storeId: item.storeId, requestKey: series.requestKey }, orderBy: { requestIndex: 'desc' }, select: { requestIndex: true } }),
        tx.courseRental.findMany({where:{storeId:item.storeId,roomId:series.roomId,cancelledAt:null,occupiedStartsAt:{lt:last},occupiedEndsAt:{gt:first}},select:{occupiedStartsAt:true,occupiedEndsAt:true}}),
      ]);
      const sessionConflict = ranges.find(range => sessions.some(session =>
        session.startsAt < range.endsAt && session.endsAt > range.startsAt &&
        (session.roomId === series.roomId || session.coachId === series.coachId),
      ));
      const ruleConflict = findFixedSeriesConflicts(rules, ranges, { roomId: series.roomId, coachId: series.coachId })[0];
      const rentalConflict=ranges.find(range=>rentals.some(rental=>rental.occupiedStartsAt<range.endsAt&&rental.occupiedEndsAt>range.startsAt));
      if (sessionConflict || ruleConflict || rentalConflict) {
        const conflictAt = sessionConflict?.startsAt ?? ruleConflict?.startsAt ?? rentalConflict!.startsAt;
        const reason = `${formatTWDateTime(conflictAt)} 與既有排課衝突，固定課仍保留原時段，請處理衝突後重試`;
        await tx.courseScheduleSeries.update({ where: { id: series.id }, data: { generationError: reason } });
        results.blocked++;
        return;
      }

      await assertCourseResources(tx,item.storeId,{templateId:series.templateId,roomId:series.roomId,coachId:series.coachId,capacity:series.capacity});
      await assertCourseSessionsFitHours(tx,item.storeId,ranges);
      await assertMusicCourseAvailability(tx,item.storeId,series.coachId,ranges);
      await assertCourseDutyCoverage(tx,item.storeId,ranges.map(range=>({...range,coachId:series.coachId})));
      const startIndex = (latest?.requestIndex ?? -1) + 1;
      const learners=z.array(z.object({customerId:z.string().min(1),cardId:z.string().nullable().optional(),stopDate:z.string().optional()})).parse(series.learnerSnapshot);
      await tx.courseSession.createMany({
        data: ranges.map((range, index) => ({
          storeId: series.storeId,
          templateId: series.templateId,
          nameSnapshot: series.nameSnapshot,
          roomId: series.roomId,
          coachId: series.coachId,
          startsAt: range.startsAt,
          endsAt: range.endsAt,
          pointCost: series.pointCost,
          capacity: series.capacity,
          enrollmentMode: series.enrollmentMode,
          scheduleType: 'FIXED',
          scheduleFrequency: series.frequency,
          requestKey: series.requestKey,
          requestIndex: startIndex + index,
          createdById: series.createdById,
        })),
      });
      if(learners.length){
        const created=await tx.courseSession.findMany({where:{storeId:series.storeId,requestKey:series.requestKey,requestIndex:{gte:startIndex}},orderBy:{requestIndex:"asc"},select:{id:true,startsAt:true}});
        for(const session of created)for(const learner of learners){
          if(learner.stopDate&&toLocalDateStr(session.startsAt)>=learner.stopDate)continue;
          await reserveScheduledMusicLearner(tx,{storeId:series.storeId,userId:series.createdById,name:"固定課延續"},{sessionId:session.id,customerId:learner.customerId,cardId:learner.cardId??null,requestKey:`schedule:${series.requestKey}:${session.id}:${learner.customerId}`},limits.maxMonthlyBookings);
        }
      }
      if(series.templateId.startsWith("teaching:")){const created=await tx.courseSession.findMany({where:{storeId:series.storeId,requestKey:series.requestKey,requestIndex:{gte:startIndex}},select:{id:true}});const {captureTeachingTuitionFees}=await import("./music-teaching-item");await captureTeachingTuitionFees(tx,series.storeId,series.requestKey,created.map(row=>row.id));}
      await tx.courseScheduleSeries.update({
        where: { id: series.id },
        data: { generatedThrough: new Date(`${toLocalDateStr(ranges[ranges.length - 1].startsAt)}T00:00:00.000Z`), generationError: null },
      });
      results.generated += ranges.length;
      changedStores.add(item.storeId);
    }, { timeout: 15000 });
    }catch(error){
      await coursePrisma.courseScheduleSeries.updateMany({where:{id:item.id,storeId:item.storeId,cancelledAt:null},data:{generationError:handleCourseActionError(error).error??"未來日期建立失敗，請核對老師、空間與學員安排"}});
      results.blocked++;
    }
  }
  for (const storeId of changedStores) kickCoachNotifications(storeId);
  return results;
}
