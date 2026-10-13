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
    await coursePrisma.$transaction(async tx => {
      // The same store lock is used by all course schedule writers.
      const stores = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Store" WHERE id = ${item.storeId} AND "industryModule"::text = 'COURSE' FOR UPDATE
      `;
      if (!stores.length) return;
      const series = await tx.courseScheduleSeries.findFirst({ where: { id: item.id, storeId: item.storeId, cancelledAt: null } });
      if (!series) return;
      const ranges = buildNextFixedSeriesOccurrences(series, toLocalDateStr(series.generatedThrough), 53)
        .filter(range => toLocalDateStr(range.startsAt) <= horizon && (!series.untilDate || toLocalDateStr(range.startsAt) <= toLocalDateStr(series.untilDate)));
      if (!ranges.length) return;

      const first = ranges[0].startsAt;
      const last = ranges[ranges.length - 1].endsAt;
      const [sessions, rules, latest] = await Promise.all([
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
      ]);
      const sessionConflict = ranges.find(range => sessions.some(session =>
        session.startsAt < range.endsAt && session.endsAt > range.startsAt &&
        (session.roomId === series.roomId || session.coachId === series.coachId),
      ));
      const ruleConflict = findFixedSeriesConflicts(rules, ranges, { roomId: series.roomId, coachId: series.coachId })[0];
      if (sessionConflict || ruleConflict) {
        const conflictAt = sessionConflict?.startsAt ?? ruleConflict!.startsAt;
        const reason = `${formatTWDateTime(conflictAt)} 與既有排課衝突，固定課仍保留原時段，請處理衝突後重試`;
        await tx.courseScheduleSeries.update({ where: { id: series.id }, data: { generationError: reason } });
        results.blocked++;
        return;
      }

      const startIndex = (latest?.requestIndex ?? -1) + 1;
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
          scheduleType: 'FIXED',
          scheduleFrequency: series.frequency,
          requestKey: series.requestKey,
          requestIndex: startIndex + index,
          createdById: series.createdById,
        })),
      });
      await tx.courseScheduleSeries.update({
        where: { id: series.id },
        data: { generatedThrough: new Date(`${toLocalDateStr(ranges[ranges.length - 1].startsAt)}T00:00:00.000Z`), generationError: null },
      });
      results.generated += ranges.length;
      changedStores.add(item.storeId);
    }, { timeout: 15000 });
  }
  for (const storeId of changedStores) kickCoachNotifications(storeId);
  return results;
}
