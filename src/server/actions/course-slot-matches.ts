"use server";

import { z } from "zod";
import { courseManager } from "@/server/services/course-access";
import { coursePrisma } from "@/lib/course-db";
import { prisma } from "@/lib/db";
import { resolvedCourseHours, type Hour, type Special } from "@/lib/course-business-hours";
import { courseDutyIntervals, dutyCoversCourse } from "@/lib/course-duty";
import { normalizeAvailabilityPeriods, periodContains, minuteOfDay } from "@/lib/course-availability";
import { dayRange, formatTWDateTime, parseTaipeiDateTime, toLocalDateStr } from "@/lib/date-utils";
import { handleCourseActionError } from "@/server/services/course-resources";

export type MusicSlotMatch = { time: string; roomId: string; coachIds: string[]; fixedOriginCoachIds?: string[] };
export type MusicUnavailableSlot = {time:string;reason:string;fixTarget?:"hours"|"teacher"|"room"};

/** One read for all slots on a day. The write actions still validate under the store lock. */
export async function getMusicSlotMatches(input: unknown) {
  try {
    const { storeId } = await courseManager("booking.read");
    const data = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      templateId: z.string().min(1),
      durationMinutes: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(120)]),
      moveSessionId: z.string().min(1).optional(),
      scope: z.enum(["SINGLE", "WEEKS", "FUTURE"]).optional(),
      weeks: z.number().int().min(2).max(12).optional(),
    }).parse(input);
    if (!parseTaipeiDateTime(data.date, "00:00")) return { success: false as const, error: "日期無效" };

    const source = data.moveSessionId ? await coursePrisma.courseSession.findFirst({
      where: { id: data.moveSessionId, storeId, cancelledAt: null },
      include: { bookings: { where: { status: { not: "CANCELLED" } }, select: { card: { select: { expiresAt: true } } } } },
    }) : null;
    if (data.moveSessionId && (!source || source.templateId !== data.templateId))
      return { success: false as const, error: "找不到要調整的課，請重新整理" };
    if (source && Math.round((source.endsAt.getTime() - source.startsAt.getTime()) / 60000) !== data.durationMinutes)
      return { success: false as const, error: "課程時長已變更，請重新剪下" };
    const template = await coursePrisma.courseTemplate.findFirst({ where: { id: data.templateId, storeId }, include:{musicSubject:{select:{isActive:true}}} });
    if (!template || (!source && (!template.isActive || template.visibility === "OFF" || template.musicSubject?.isActive===false)))
      return { success: false as const, error: "課程目前不可新增排課" };

    const series = source && data.scope !== "SINGLE"
      ? await coursePrisma.courseSession.findMany({
          where: { storeId, requestKey: source.requestKey, startsAt: { gte: source.startsAt }, cancelledAt: null },
          include: { bookings: { where: { status: { not: "CANCELLED" } }, select: { card: { select: { expiresAt: true } } } } },
          orderBy: { startsAt: "asc" },
        })
      : source ? [source] : [];
    const moved = data.scope === "WEEKS" ? series.slice(0, data.weeks ?? 2) : series;
    const dateOffset = source ? parseTaipeiDateTime(data.date, "00:00")!.getTime() - parseTaipeiDateTime(toLocalDateStr(source.startsAt), "00:00")!.getTime() : 0;
    const projectedDates = source ? moved.map(s => toLocalDateStr(new Date(s.startsAt.getTime() + dateOffset))) : [data.date];
    const firstDate = projectedDates.reduce((a, b) => a < b ? a : b, data.date);
    const lastDate = projectedDates.reduce((a, b) => a > b ? a : b, data.date);
    const [rooms, staff, hours, specials, weekly, exceptions, dutyConfig, assignments, occupied] = await Promise.all([
      coursePrisma.courseRoom.findMany({ where: { storeId, isActive: true }, select: { id: true, capacity: true } }),
      prisma.staff.findMany({ where: { storeId, status: "ACTIVE", courseCoachEnabled: true }, select: { id: true, courseQualificationsConfirmed: true, courseQualifiedTemplateIds: true } }),
      prisma.$queryRaw<Hour[]>`SELECT * FROM "BusinessHours" WHERE "storeId"=${storeId}`,
      prisma.$queryRaw<Special[]>`SELECT * FROM "SpecialBusinessDay" WHERE "storeId"=${storeId}`,
      prisma.$queryRaw<{staffId:string;dayOfWeek:number;segments:unknown}[]>`SELECT "staffId","dayOfWeek",segments FROM "CourseStaffAvailability" WHERE "storeId"=${storeId}`,
      prisma.$queryRaw<{staffId:string;date:Date;type:string;segments:unknown}[]>`SELECT "staffId",date,type,segments FROM "CourseStaffAvailabilityException" WHERE "storeId"=${storeId} AND date>=${firstDate}::date AND date<=${lastDate}::date`,
      prisma.$queryRaw<{dutySchedulingEnabled:boolean}[]>`SELECT "dutySchedulingEnabled" FROM "ShopConfig" WHERE "storeId"=${storeId}`,
      prisma.$queryRaw<{date:Date;slotTime:string;staffId:string}[]>`SELECT date,"slotTime","staffId" FROM "DutyAssignment" WHERE "storeId"=${storeId} AND date>=${firstDate}::date AND date<=${lastDate}::date`,
      coursePrisma.courseSession.findMany({ where: { storeId, cancelledAt: null, releasedAt: null, startsAt: { lt: dayRange(lastDate).end }, endsAt: { gt: dayRange(firstDate).start } }, select: { id: true, startsAt: true, endsAt: true, roomId: true, coachId: true } }),
    ]);
    const ignored = new Set(moved.map(s => s.id));
    const storeCache = new Map<string, ReturnType<typeof resolvedCourseHours>>();
    const periodsFor = (date: string) => {
      if (!storeCache.has(date)) storeCache.set(date, resolvedCourseHours(date, hours, specials));
      return storeCache.get(date)!;
    };
    const teacherPeriods = (coachId: string, date: string) => {
      const ex = exceptions.find(e => e.staffId === coachId && e.date.toISOString().slice(0, 10) === date);
      if (ex?.type === "UNAVAILABLE") return [];
      if (ex?.type === "CUSTOM") return normalizeAvailabilityPeriods(ex.segments);
      const rows = weekly.filter(w => w.staffId === coachId);
      if (!rows.length) return periodsFor(date).periods;
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      return normalizeAvailabilityPeriods(rows.find(w => w.dayOfWeek === weekday)?.segments);
    };
    const validPair = (time: string, roomId: string, coachId: string) => {
      const first = parseTaipeiDateTime(data.date, time);
      if (!first) return false;
      const shift = source ? first.getTime() - source.startsAt.getTime() : 0;
      const targets = source ? moved.map(s => ({startsAt:new Date(s.startsAt.getTime() + shift), bookings:s.bookings})) : [{startsAt:first,bookings:[]}];
      return targets.every(({startsAt,bookings}) => {
        const endsAt = new Date(startsAt.getTime() + data.durationMinutes * 60000);
        const date = toLocalDateStr(startsAt);
        const start = formatTWDateTime(startsAt).slice(11);
        const end = formatTWDateTime(endsAt).slice(11);
        const store = periodsFor(date);
        if (toLocalDateStr(endsAt) !== date || store.status === "closed" || store.status === "training" ||
            (store.periods.length > 0 && !periodContains(store.periods, start, data.durationMinutes))) return false;
        if (!periodContains(teacherPeriods(coachId, date), start, data.durationMinutes)) return false;
        if (bookings.some(b => b.card && b.card.expiresAt < startsAt)) return false;
        if (dutyConfig[0]?.dutySchedulingEnabled && !dutyCoversCourse(start, end,
          courseDutyIntervals(date, hours, specials),
          assignments.filter(a => a.staffId === coachId && a.date.toISOString().slice(0, 10) === date).map(a => a.slotTime))) return false;
        return !occupied.some(s => !ignored.has(s.id) && (s.roomId === roomId || s.coachId === coachId) && s.startsAt < endsAt && s.endsAt > startsAt);
      });
    };
    const store = periodsFor(data.date);
    const slots: MusicSlotMatch[] = [];
    const origins=!source ? await coursePrisma.courseSession.findMany({where:{storeId,cancelledAt:null,OR:[
      {releasedAt:{not:null},startsAt:{lt:dayRange(data.date).end},endsAt:{gt:dayRange(data.date).start}},
      {rescheduledFromStartsAt:{lt:dayRange(data.date).end},rescheduledFromEndsAt:{gt:dayRange(data.date).start}},
    ]},select:{requestKey:true,releasedAt:true,startsAt:true,endsAt:true,roomId:true,coachId:true,rescheduledFromStartsAt:true,rescheduledFromEndsAt:true,rescheduledFromRoomId:true,rescheduledFromCoachId:true,template:{select:{musicScheduleMode:true}}}}) : [];
    const recurring=origins.length ? new Set((await coursePrisma.courseSession.groupBy({by:["requestKey"],where:{storeId,cancelledAt:null,requestKey:{in:[...new Set(origins.map(o=>o.requestKey))]}},_count:{id:true},having:{id:{_count:{gt:1}}}})).map(row=>row.requestKey)) : new Set<string>();
    const fixedOrigins=origins.filter(o=>o.template.musicScheduleMode==="FIXED"||recurring.has(o.requestKey));
    const keepsFixed=(roomId:string,coachId:string,time:string)=>{
      const start=parseTaipeiDateTime(data.date,time)!;
      const end=new Date(start.getTime()+data.durationMinutes*60000);
      return fixedOrigins.some(o=>o.releasedAt
        ? o.startsAt<end&&o.endsAt>start&&(o.roomId===roomId||o.coachId===coachId)
        : o.rescheduledFromStartsAt&&o.rescheduledFromEndsAt&&o.rescheduledFromStartsAt<end&&o.rescheduledFromEndsAt>start&&(o.rescheduledFromRoomId===roomId||o.rescheduledFromCoachId===coachId));
    };
    for (const period of store.periods) {
      for (let minute = Math.ceil(minuteOfDay(period.openTime) / 30) * 30; minute + data.durationMinutes <= minuteOfDay(period.closeTime); minute += 30) {
        const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
        for (const room of rooms) {
          if (!template.musicSubject && room.capacity !== null && room.capacity < (source?.capacity ?? template.capacity)) continue;
          const coachIds = staff.filter(coach => {
            const unchanged = source?.coachId === coach.id && source.templateId === data.templateId;
            if ((!unchanged || coach.courseQualificationsConfirmed) && (!coach.courseQualificationsConfirmed || !coach.courseQualifiedTemplateIds.includes(data.templateId))) return false;
            return validPair(time, room.id, coach.id);
          }).map(coach => coach.id);
          if (coachIds.length) slots.push({ time, roomId: room.id, coachIds, fixedOriginCoachIds:coachIds.filter(coachId=>keepsFixed(room.id,coachId,time)) });
        }
      }
    }
    const opening=store.periods.map(p=>minuteOfDay(p.openTime));
    const closing=store.periods.map(p=>minuteOfDay(p.closeTime));
    const firstMinute=Math.min(9*60,...opening);
    const lastMinute=Math.max(22*60,...closing);
    const qualified=staff.filter(coach=>coach.courseQualificationsConfirmed&&coach.courseQualifiedTemplateIds.includes(data.templateId));
    const suitableRooms=rooms.filter(room=>!!template.musicSubject||room.capacity===null||room.capacity>=(source?.capacity??template.capacity));
    const unavailable:MusicUnavailableSlot[]=[];
    for(let minute=Math.ceil(firstMinute/30)*30;minute+data.durationMinutes<=lastMinute;minute+=30){
      const time=`${String(Math.floor(minute/60)).padStart(2,"0")}:${String(minute%60).padStart(2,"0")}`;
      if(slots.some(slot=>slot.time===time))continue;
      const startsAt=parseTaipeiDateTime(data.date,time)!;
      const endsAt=new Date(startsAt.getTime()+data.durationMinutes*60000);
      const availableCoaches=qualified.filter(coach=>periodContains(teacherPeriods(coach.id,data.date),time,data.durationMinutes));
      const freeCoaches=availableCoaches.filter(coach=>!occupied.some(s=>!ignored.has(s.id)&&s.coachId===coach.id&&s.startsAt<endsAt&&s.endsAt>startsAt));
      const freeRooms=suitableRooms.filter(room=>!occupied.some(s=>!ignored.has(s.id)&&s.roomId===room.id&&s.startsAt<endsAt&&s.endsAt>startsAt));
      const reason=!periodContains(store.periods,time,data.durationMinutes)?"非營業時段"
        : !suitableRooms.length?"沒有符合課程人數的教室"
        : !qualified.length?"沒有符合這門課資格的老師"
        : !availableCoaches.length?"合格老師未排班"
        : !freeCoaches.length?"合格老師已有課"
        : !freeRooms.length?"合適教室已有課"
        : "排班或後續課次無法完整排入";
      const fixTarget=!periodContains(store.periods,time,data.durationMinutes)?"hours"
        : !suitableRooms.length?"room"
        : !qualified.length || !availableCoaches.length?"teacher":undefined;
      unavailable.push({time,reason,fixTarget});
    }
    return { success: true as const, data: slots, unavailable };
  } catch (error) {
    return handleCourseActionError(error);
  }
}
