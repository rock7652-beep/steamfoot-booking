"use server";
import { assertCourseDutyCoverage } from "@/server/services/course-duty";
import { assertMusicCourseAvailability, assertMusicCourseDuration } from "@/server/services/course-availability";
import { assertCourseSessionsFitHours } from "@/server/services/course-business-hours";

import { assertCourseResources, assertNoCourseResourceUse, handleCourseActionError } from "@/server/services/course-resources";
import { courseTransaction } from "@/server/services/course-access";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { coursePrisma } from "@/lib/course-db";
import { prisma } from "@/lib/db";
import { courseManager } from "@/server/services/course-access";
import { AppError } from "@/lib/errors";
import {
  buildCourseOccurrences,
  courseScheduleInput,
  courseTemplateInput,
} from "@/lib/course-scheduling";
import { formatTWDateTime, parseTaipeiDateTime } from "@/lib/date-utils";

export async function scheduleTeacherMakeup(input: unknown) {
  try {
    const {user,storeId}=await writableStore("booking.create");
    const data=z.object({sourceSessionId:z.string().min(1),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),time:z.string().regex(/^([01]\d|2[0-3]):(?:00|30)$/),roomId:z.string().min(1),coachId:z.string().min(1)}).parse(input);
    const startsAt=parseTaipeiDateTime(data.date,data.time);
    if(!startsAt || startsAt <= new Date())throw new AppError("VALIDATION","請選擇未來的補課時段");
    const created=await courseTransaction(storeId,async(tx)=>{
      const source=await tx.courseSession.findFirst({where:{id:data.sourceSessionId,storeId,cancelledAt:null},include:{bookings:{where:{status:{not:"CANCELLED"}}}}});
      if(!source || source.teacherAttendance!=="NO_SHOW")throw new AppError("VALIDATION","請先記錄老師曠課");
      if(!source.bookings.length)throw new AppError("VALIDATION","這堂沒有需要補課的學員");
      if(source.bookings.some(booking=>booking.status==="ATTENDED"))throw new AppError("CONFLICT","這堂已有出席紀錄，請先核對再安排免費補課");
      if(await tx.courseSession.findFirst({where:{storeId,teacherMakeupForSessionId:source.id,cancelledAt:null}}))throw new AppError("CONFLICT","這堂已安排免費補課");
      const endsAt=new Date(startsAt.getTime()+source.endsAt.getTime()-source.startsAt.getTime());
      if(endsAt.getTime()<=startsAt.getTime())throw new AppError("VALIDATION","課程時長不正確");
      const range={startsAt,endsAt};
      await assertCourseResources(tx,storeId,{templateId:source.templateId,roomId:data.roomId,coachId:data.coachId,capacity:source.capacity},source);
      await assertCourseSessionsFitHours(tx,storeId,[range]);
      await assertMusicCourseAvailability(tx,storeId,data.coachId,[range]);
      await assertCourseDutyCoverage(tx,storeId,[{...range,coachId:data.coachId}]);
      const collision=await tx.courseSession.findFirst({where:{storeId,cancelledAt:null,startsAt:{lt:endsAt},endsAt:{gt:startsAt},OR:[{roomId:data.roomId},{coachId:data.coachId}]}});
      if(collision)throw new AppError("CONFLICT",`${formatTWDateTime(collision.startsAt)} 教室或老師已有課程`);
      const session=await tx.courseSession.create({data:{storeId,templateId:source.templateId,roomId:data.roomId,coachId:data.coachId,nameSnapshot:`免費補課 · ${source.nameSnapshot}`,startsAt,endsAt,pointCost:0,capacity:source.capacity,requestKey:`teacher-makeup:${source.id}`,requestIndex:0,createdById:user.id,teacherMakeupForSessionId:source.id}});
      await tx.courseBooking.createMany({data:source.bookings.map(booking=>({storeId,sessionId:session.id,cardId:null,bookingKind:"TEACHER_MAKEUP",customerId:booking.customerId,operatorUserId:user.id,operatorCustomerId:null,operatorName:user.name??"店長",customerName:booking.customerName,pointCost:0,status:"RESERVED",notes:`原課 ${formatTWDateTime(source.startsAt)} 老師曠課補課`,requestKey:`teacher-makeup:${source.id}:${booking.customerId}`}))});
      return session.id;
    });
    revalidatePath("/dashboard/courses");revalidatePath("/dashboard");return {success:true as const,sessionId:created};
  }catch(error){return handleCourseActionError(error);}
}

async function writableStore(
  permission: "booking.create" | "booking.update" = "booking.create",
) {
  return courseManager(permission);
}

async function validateMusicTemplate(storeId:string,data:{classType:string|null;pointCost:number;musicPricePerLesson:number|null;musicTermLessons:4|8|null;musicValidityDaysPerTerm:number|null;musicScheduleMode:"FIXED"|"APPOINTMENT"|null;musicTrialMode:"FREE"|"PAID"|null;musicTeacherFeeBase:number|null;durationMinutes:number}) {
  const music=await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"},select:{storeId:true}});
  if (!music) return;
  if (!data.classType || data.musicPricePerLesson===null || data.musicTermLessons===null || data.musicValidityDaysPerTerm===null || !data.musicScheduleMode)
    throw new AppError("VALIDATION","音樂課程需設定課型、每堂售價、每期堂數、有效天數與排課方式");
  if (data.pointCost!==1) throw new AppError("VALIDATION","音樂課程只使用堂數，每次預約固定 1 堂");
  if (data.musicTermLessons !== (data.classType==="GROUP" ? 8 : 4))
    throw new AppError("VALIDATION",data.classType==="GROUP" ? "團體班每期 8 堂" : "個別課與自組班每期 4 堂");
  if (data.musicTrialMode==="FREE" && (data.durationMinutes!==30 || data.musicTeacherFeeBase===null))
    throw new AppError("VALIDATION","免費體驗為 30 分鐘，需設定老師拆帳計算基礎");
  if (data.musicTrialMode==="PAID" && data.durationMinutes<60)
    throw new AppError("VALIDATION","付費體驗使用完整一堂課，至少 60 分鐘");
}

export async function updateCourseRoom(input: unknown) {
  try {
    const { storeId } = await writableStore("booking.update");
    const data = z
      .object({
        id: z.string().min(1),
        name: z.string().trim().min(1, "請填寫教室名稱").max(80),
        category: z.string().trim().max(40).default(""),
        capacity: z.number().int().min(1).max(500).nullable().default(null),
        details: z.string().trim().max(5000).default(""),
        equipment: z.string().trim().max(1000).default(""),
        location: z.string().trim().max(500).default(""),
      })
      .parse(input);
    await courseTransaction(storeId, async tx => {
      const existing = await tx.courseRoom.findFirst({where:{id:data.id,storeId},select:{capacity:true}});
      if (!existing) throw new AppError("NOT_FOUND","找不到本店教室");
      if (data.capacity !== null && (existing.capacity === null || data.capacity < existing.capacity)) {
        await assertNoCourseResourceUse(tx, storeId, {roomId:data.id,capacity:data.capacity});
      }
      const {id,...fields}=data;
      const result = await tx.courseRoom.updateMany({where:{id,storeId},data:fields});
      if (!result.count) throw new AppError("NOT_FOUND","找不到本店教室");
    });
    revalidatePath("/dashboard/courses");
    revalidatePath("/dashboard");
    revalidatePath("/hq/dashboard/courses");
    revalidatePath("/book");
    return { success: true as const };
  } catch (error) {
    return handleCourseActionError(error);
  }
}

export async function updateCourseTemplate(input: unknown) {
  try {
    const { storeId } = await writableStore("booking.update");
    const { id, ...data } = courseTemplateInput
      .extend({ id: z.string().min(1) })
      .parse(input);
    await validateMusicTemplate(storeId,data);
    const existing = await coursePrisma.courseTemplate.findFirst({where:{id,storeId},select:{classType:true}});
    if (!existing) throw new AppError("VALIDATION", "找不到本店課程，請重新整理");
    if (existing.classType !== data.classType && await coursePrisma.courseSession.count({where:{storeId,templateId:id}}))
      throw new AppError("VALIDATION", "已排課的課型不能變更；請複製課程另建自組班或團體班");
    await assertMusicCourseDuration(coursePrisma,storeId,data.durationMinutes);
    const room = data.defaultRoomId
      ? await coursePrisma.courseRoom.findFirst({
          where: { id: data.defaultRoomId, storeId, isActive: true },
        })
      : null;
    if (data.defaultRoomId && !room)
      throw new AppError("VALIDATION", "請選擇本店可使用的教室");
    const result = await coursePrisma.courseTemplate.updateMany({
      where: { id, storeId },
      data,
    });
    if (!result.count)
      throw new AppError("VALIDATION", "找不到本店課程，請重新整理");
    revalidatePath("/dashboard/courses");
    revalidatePath("/dashboard");
    revalidatePath("/hq/dashboard/courses");
    revalidatePath("/book");
    return { success: true as const };
  } catch (error) {
    return handleCourseActionError(error);
  }
}

export async function updateCourseSession(input: unknown) {
  try {
    const { storeId } = await writableStore("booking.update");
    const data = courseScheduleInput
      .omit({ templateId: true, requestKey: true, repeatUntil: true })
      .extend({
        id: z.string().min(1),
        templateId: z.string().min(1).optional(),
        nameSnapshot: z.string().trim().min(1, "請填寫課程名稱").max(80),
        pointCost: z.number().int().min(1).max(10000),
      })
      .parse(input);
    const [range] = buildCourseOccurrences({
      ...data,
      templateId: "edit",
      requestKey: "00000000-0000-4000-8000-000000000000",
    });
    await coursePrisma.$transaction(
      async (tx) => {
        const stores = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM "Store" WHERE id = ${storeId} AND "industryModule"::text = 'COURSE' FOR UPDATE`;
        if (!stores.length)
          throw new AppError("FORBIDDEN", "此功能僅適用於課程門市");
        const [session, room, coaches] = await Promise.all([
          tx.courseSession.findFirst({
            where: { id: data.id, storeId, cancelledAt: null },
          }),
          tx.courseRoom.findFirst({
            where: { id: data.roomId, storeId, isActive: true },
          }),
          tx.$queryRaw<
            Array<{ id: string }>
          >`SELECT id FROM "Staff" WHERE id = ${data.coachId} AND "storeId" = ${storeId} AND status::text = 'ACTIVE'`,
        ]);
        if (!session || !room || !coaches.length)
          throw new AppError("VALIDATION", "請選擇本店有效的排課、教室與教練");
        await assertCourseResources(tx,storeId,{...data,templateId:data.templateId ?? session.templateId},session);
        const bookings = await tx.courseBooking.findMany({
          where: {
            storeId,
            sessionId: session.id,
            status: { not: "CANCELLED" },
          },
          include: { card: { select: { expiresAt: true } } },
        });
        if (bookings.some((b) => b.status === "ATTENDED"))
          throw new AppError(
            "CONFLICT",
            "已完成點名的課程保留歷史，不可修改排課",
          );
        if (bookings.some((b) => b.card && b.card.expiresAt < range.startsAt))
          throw new AppError(
            "CONFLICT",
            "新日期超過已預約方案期限，尚未修改排課",
          );
        if (data.capacity < bookings.length)
          throw new AppError("CONFLICT", "人數上限不能少於已預約人數");
        if (bookings.length && (data.pointCost !== session.pointCost || (data.templateId && data.templateId !== session.templateId)))
          throw new AppError(
            "CONFLICT",
            "已有預約不能改動每人點數，請先處理預約",
          );
        const conflict = await tx.courseSession.findFirst({
          where: {
            storeId,
            id: { not: data.id },
            cancelledAt: null,
            startsAt: { lt: range.endsAt },
            endsAt: { gt: range.startsAt },
            OR: [{ roomId: data.roomId }, { coachId: data.coachId }],
          },
          orderBy: { startsAt: "asc" },
        });
        if (conflict)
          throw new AppError(
            "CONFLICT",
            `${formatTWDateTime(conflict.startsAt)} ${conflict.roomId === data.roomId ? "教室" : "教練"}已有課程，尚未儲存修改`,
          );
        await assertCourseSessionsFitHours(tx,storeId,[range]);
        await assertMusicCourseAvailability(tx,storeId,data.coachId,[range]);
        await assertCourseDutyCoverage(tx,storeId,[{...range,coachId:data.coachId}]);
        await tx.courseSession.update({
          where: { id: session.id, storeId },
          data: {
            ...range,
            templateId: data.templateId ?? session.templateId,
            nameSnapshot: data.nameSnapshot,
            roomId: data.roomId,
            coachId: data.coachId,
            capacity: data.capacity,
            pointCost: data.pointCost,
          },
        });
      },
      { timeout: 15000 },
    );
    revalidatePath("/dashboard/courses");
    revalidatePath("/dashboard");
    revalidatePath("/hq/dashboard/courses");
    revalidatePath("/book");
    return { success: true as const };
  } catch (error) {
    return handleCourseActionError(error);
  }
}

export async function createCourseRoom(input: unknown) {
  try {
    const { storeId } = await writableStore();
    const { name, category, capacity, details, equipment, location } = z
      .object({
        name: z.string().trim().min(1, "請填寫教室名稱").max(80),
        category: z.string().trim().max(40).default(""),
        capacity: z.number().int().min(1).max(500).nullable().default(null),
        details: z.string().trim().max(5000).default(""),
        equipment: z.string().trim().max(1000).default(""),
        location: z.string().trim().max(500).default(""),
      })
      .parse(typeof input === "string" ? { name: input } : input);
    const room = await coursePrisma.courseRoom.create({
      data: { name, category, capacity, details, equipment, location, storeId },
      select: { id: true, name: true },
    });
    revalidatePath("/dashboard/courses");
    revalidatePath("/dashboard");
    return { success: true as const, data: room };
  } catch (error) {
    return handleCourseActionError(error);
  }
}

export async function createCourseTemplate(input: unknown) {
  try {
    const { storeId } = await writableStore();
    const data = courseTemplateInput.parse(input);
    await validateMusicTemplate(storeId,data);
    await assertMusicCourseDuration(coursePrisma,storeId,data.durationMinutes);
    const room = data.defaultRoomId
      ? await coursePrisma.courseRoom.findFirst({
          where: { id: data.defaultRoomId, storeId, isActive: true },
          select: { id: true },
        })
      : null;
    if (data.defaultRoomId && !room)
      throw new AppError("VALIDATION", "請選擇本店可使用的教室");
    await coursePrisma.courseTemplate.create({ data: { ...data, storeId } });
    revalidatePath("/dashboard/courses");
    revalidatePath("/dashboard");
    return { success: true as const };
  } catch (error) {
    return handleCourseActionError(error);
  }
}

export async function createCourseSchedule(input: unknown) {
  try {
    const { user, storeId } = await writableStore();
    const data = courseScheduleInput
      .extend({ sourceSessionId: z.string().min(1).optional() })
      .parse(input);
    let occurrences: ReturnType<typeof buildCourseOccurrences>;
    try {
      occurrences = buildCourseOccurrences(data);
    } catch (error) {
      throw new AppError(
        "VALIDATION",
        error instanceof Error ? error.message : "排課日期不正確",
      );
    }
    const result = await coursePrisma.$transaction(
      async (tx) => {
        // Serialize this store's batches; a retried request returns its original
        // batch. DB exclusion constraints also protect writes outside this action.
        const stores = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Store" WHERE id = ${storeId} AND "industryModule"::text = 'COURSE' FOR UPDATE
      `;
        if (!stores.length)
          throw new AppError("FORBIDDEN", "此功能僅適用於課程門市");
        const existing = await tx.courseSession.findMany({
          where: { storeId, requestKey: data.requestKey },
          orderBy: { requestIndex: "asc" },
        });
        if (existing.length) {
          if (
            existing.length !== occurrences.length ||
            existing.some(
              (session, index) =>
                session.createdById !== user.id ||
                session.templateId !== data.templateId ||
                session.roomId !== data.roomId ||
                session.coachId !== data.coachId ||
                session.capacity !== data.capacity ||
                session.startsAt.getTime() !==
                  occurrences[index].startsAt.getTime() ||
                session.endsAt.getTime() !==
                  occurrences[index].endsAt.getTime(),
            )
          )
            throw new AppError(
              "CONFLICT",
              "這次排課已送出，請重新開啟排課表單",
            );
          return { count: existing.length };
        }
        const source = data.sourceSessionId
          ? await tx.courseSession.findFirst({
              where: { id: data.sourceSessionId, storeId, cancelledAt: null },
            })
          : null;
        if (
          data.sourceSessionId &&
          (!source || source.templateId !== data.templateId)
        )
          throw new AppError(
            "VALIDATION",
            "找不到可複製的本店課程，請重新整理",
          );
        const [template, room, coaches] = await Promise.all([
          tx.courseTemplate.findFirst({
            where: { id: data.templateId, storeId, isActive: true },
          }),
          tx.courseRoom.findFirst({
            where: { id: data.roomId, storeId, isActive: true },
            select: { id: true },
          }),
          tx.$queryRaw<
            Array<{ id: string }>
          >`SELECT id FROM "Staff" WHERE id = ${data.coachId} AND "storeId" = ${storeId} AND status::text = 'ACTIVE'`,
        ]);
        if (!template || !room || !coaches.length)
          throw new AppError("VALIDATION", "請選擇本店有效的課程、教室與教練");
        await assertCourseResources(tx,storeId,data);
        const conflict = await tx.courseSession.findFirst({
          where: {
            storeId,
            cancelledAt: null,
            AND: [
              { OR: [{ roomId: data.roomId }, { coachId: data.coachId }] },
              {
                OR: occurrences.map((range) => ({
                  startsAt: { lt: range.endsAt },
                  endsAt: { gt: range.startsAt },
                })),
              },
            ],
          },
          orderBy: { startsAt: "asc" },
        });
        if (conflict)
          throw new AppError(
            "CONFLICT",
            `${formatTWDateTime(conflict.startsAt)} ${conflict.roomId === data.roomId ? "教室" : "教練"}已有課程，整批尚未建立`,
          );
        await assertCourseSessionsFitHours(tx,storeId,occurrences);
        await assertMusicCourseAvailability(tx,storeId,data.coachId,occurrences);
        await assertCourseDutyCoverage(tx,storeId,occurrences.map(s=>({...s,coachId:data.coachId})));
        await tx.courseSession.createMany({
          data: occurrences.map((range, requestIndex) => ({
            ...range,
            storeId,
            templateId: template.id,
            nameSnapshot: source?.nameSnapshot ?? template.name,
            roomId: room.id,
            coachId: data.coachId,
            pointCost: source?.pointCost ?? template.pointCost,
            capacity: data.capacity,
            requestKey: data.requestKey,
            requestIndex,
            createdById: user.id,
          })),
        });
        return { count: occurrences.length };
      },
      { timeout: 15000 },
    );
    revalidatePath("/dashboard/courses");
    revalidatePath("/dashboard");
    return { success: true as const, data: result };
  } catch (error) {
    return handleCourseActionError(error);
  }
}

export async function moveCourseSessions(input: unknown) {
  try {
    const { user, storeId } = await writableStore("booking.update");
    const d = z.object({
      id: z.string().min(1),
      scope: z.enum(["SINGLE", "WEEKS", "FUTURE"]),
      weeks: z.number().int().min(2).max(12).optional(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      time: z.string().regex(/^([01]\d|2[0-3]):(?:00|30)$/),
      roomId: z.string().min(1),
      coachId: z.string().min(1),
      restore: z.boolean().optional(),
    }).parse(input);
    if (d.scope === "WEEKS" && !d.weeks)
      throw new AppError("VALIDATION", "請選擇週數");

    const targetStart = parseTaipeiDateTime(d.date, d.time);
    if (!targetStart) throw new AppError("VALIDATION", "請選擇有效時間");

    const result = await courseTransaction(storeId, async (tx) => {
      const source = await tx.courseSession.findFirst({
        where: { id: d.id, storeId, cancelledAt: null },
        include: {
          bookings: {
            where: { status: { not: "CANCELLED" } },
            include: { card: { select: { expiresAt: true } } },
          },
        },
      });
      if (!source) throw new AppError("NOT_FOUND", "找不到本店課程");
      if (d.restore) {
        if (d.scope !== "SINGLE" || !source.rescheduledFromStartsAt || !source.rescheduledFromRoomId || !source.rescheduledFromCoachId)
          throw new AppError("VALIDATION", "這堂課目前沒有可還原的原時段");
        const original = formatTWDateTime(source.rescheduledFromStartsAt);
        if (d.date !== original.slice(0, 10) || d.time !== original.slice(11, 16) ||
            d.roomId !== source.rescheduledFromRoomId || d.coachId !== source.rescheduledFromCoachId)
          throw new AppError("VALIDATION", "原時段已變更，請重新整理課表");
      }

      const candidates = d.scope === "SINGLE"
        ? [source]
        : await tx.courseSession.findMany({
            where: {
              storeId,
              requestKey: source.requestKey,
              startsAt: { gte: source.startsAt },
              cancelledAt: null,
            },
            include: {
              bookings: {
                where: { status: { not: "CANCELLED" } },
                include: { card: { select: { expiresAt: true } } },
              },
            },
            orderBy: { startsAt: "asc" },
          });
      const sessions = d.scope === "WEEKS"
        ? candidates.slice(0, d.weeks)
        : candidates;
      if (!sessions.length) throw new AppError("NOT_FOUND", "沒有可調整的課程");

      const duration = source.endsAt.getTime() - source.startsAt.getTime();
      const shift = targetStart.getTime() - source.startsAt.getTime();
      const changes = sessions.map((session) => ({
        session,
        startsAt: new Date(session.startsAt.getTime() + shift),
        endsAt: new Date(session.startsAt.getTime() + shift + duration),
      }));
      const selectedIds = sessions.map((session) => session.id);

      const [room, coaches] = await Promise.all([
        tx.courseRoom.findFirst({ where: { id: d.roomId, storeId, isActive: true } }),
        tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "Staff"
          WHERE id = ${d.coachId} AND "storeId" = ${storeId} AND status::text = 'ACTIVE'
        `,
      ]);
      if (!room || !coaches.length)
        throw new AppError("VALIDATION", "請選擇可用的老師與教室");

      for (const change of changes) {
        await assertCourseResources(
          tx,
          storeId,
          {
            templateId: change.session.templateId,
            roomId: d.roomId,
            coachId: d.coachId,
            capacity: change.session.capacity,
          },
          change.session,
        );
        if (change.session.bookings.some((booking) => booking.status === "ATTENDED"))
          throw new AppError("CONFLICT", "已完成的課程不可調整");
        if (change.session.bookings.some((booking) => booking.card && booking.card.expiresAt < change.startsAt))
          throw new AppError("CONFLICT", "新日期超過方案期限");

        const conflict = await tx.courseSession.findFirst({
          where: {
            storeId,
            id: { notIn: selectedIds },
            cancelledAt: null,
            startsAt: { lt: change.endsAt },
            endsAt: { gt: change.startsAt },
            OR: [{ roomId: d.roomId }, { coachId: d.coachId }],
          },
          select: { startsAt: true, roomId: true, coachId: true },
        });
        if (conflict)
          throw new AppError("CONFLICT", `${formatTWDateTime(change.startsAt)} 已有課`);
      }

      await assertCourseSessionsFitHours(tx, storeId, changes);
      await assertMusicCourseAvailability(tx, storeId, d.coachId, changes);
      await assertCourseDutyCoverage(tx, storeId, changes.map((change) => ({ ...change, coachId: d.coachId })));

      await tx.courseSession.updateMany({
        where: { storeId, id: { in: selectedIds } },
        data: { cancelledAt: new Date() },
      });

      const movedAt = new Date();
      for (const change of changes) {
        const temporary = !d.restore;
        await tx.courseSessionMove.create({
          data: {
            storeId,
            sessionId: change.session.id,
            scope: d.scope,
            fromStartsAt: change.session.startsAt,
            fromEndsAt: change.session.endsAt,
            fromRoomId: change.session.roomId,
            fromCoachId: change.session.coachId,
            toStartsAt: change.startsAt,
            toEndsAt: change.endsAt,
            toRoomId: d.roomId,
            toCoachId: d.coachId,
            actorUserId: user.id,
          },
        });
        await tx.courseSession.update({
          where: { id: change.session.id },
          data: {
            startsAt: change.startsAt,
            endsAt: change.endsAt,
            roomId: d.roomId,
            coachId: d.coachId,
            cancelledAt: null,
            rescheduledFromStartsAt: temporary
              ? change.session.rescheduledFromStartsAt ?? change.session.startsAt
              : null,
            rescheduledFromEndsAt: temporary
              ? change.session.rescheduledFromEndsAt ?? change.session.endsAt
              : null,
            rescheduledFromRoomId: temporary
              ? change.session.rescheduledFromRoomId ?? change.session.roomId
              : null,
            rescheduledFromCoachId: temporary
              ? change.session.rescheduledFromCoachId ?? change.session.coachId
              : null,
            rescheduleKind: temporary ? d.scope : null,
            rescheduledAt: temporary ? movedAt : null,
            rescheduledById: temporary ? user.id : null,
          },
        });
      }
      return { count: changes.length };
    });

    revalidatePath("/dashboard/courses");
    revalidatePath("/dashboard");
    revalidatePath("/book");
    return { success: true as const, data: result };
  } catch (error) {
    return handleCourseActionError(error);
  }
}

/** Reversible catalogue visibility. Session snapshots and history are never deleted. */
export async function setCourseCatalogStatus(input: unknown) {
  try {
    const { storeId } = await writableStore("booking.update");
    const data = z
      .object({
        id: z.string().min(1).max(100),
        kind: z.enum(["room", "template"]),
        isActive: z.boolean(),
        visibility: z.enum(["PUBLIC","HIDDEN","OFF"]).optional(),
      })
      .parse(input);
    await coursePrisma.$transaction(async (tx) => {
      const stores = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM "Store" WHERE id = ${storeId} AND "industryModule"::text = 'COURSE' FOR UPDATE`;
      if (!stores.length)
        throw new AppError("FORBIDDEN", "此功能僅適用於課程門市");
      if (data.kind === "room" && !data.isActive) await assertNoCourseResourceUse(tx,storeId,{roomId:data.id});
      const result =
        data.kind === "room"
          ? await tx.courseRoom.updateMany({
              where: { id: data.id, storeId },
              data: { isActive: data.isActive },
            })
          : await tx.courseTemplate.updateMany({
              where: { id: data.id, storeId },
              data: { isActive: (data.visibility ?? (data.isActive ? "PUBLIC" : "OFF")) !== "OFF", visibility: data.visibility ?? (data.isActive ? "PUBLIC" : "OFF") },
            });
      if (!result.count)
        throw new AppError("NOT_FOUND", "找不到本店資料，請重新整理");
    });
    revalidatePath("/dashboard/courses");
    revalidatePath("/dashboard");
    revalidatePath("/hq/dashboard/courses");
    revalidatePath("/book");
    return { success: true as const };
  } catch (error) {
    return handleCourseActionError(error);
  }
}

export async function previewCourseSchedule(input: unknown) {
  try {
    const { storeId } = await writableStore();
    const d = courseScheduleInput.parse(input);
    const dates = buildCourseOccurrences(d);
    await assertCourseResources(coursePrisma,storeId,d);
    // Preview follows the same business-hours and duty rules as the final save.
    // Saving still rechecks under the store lock to protect concurrent edits.
    await Promise.all([
      assertCourseSessionsFitHours(coursePrisma, storeId, dates),
      assertCourseDutyCoverage(coursePrisma, storeId, dates.map(r => ({ ...r, coachId: d.coachId }))),
    ]);
    const [conflicts, room] = await Promise.all([
      coursePrisma.courseSession.findMany({
        where: {
          storeId,
          cancelledAt: null,
          AND: [
            { OR: [{ roomId: d.roomId }, { coachId: d.coachId }] },
            {
              OR: dates.map((r) => ({
                startsAt: { lt: r.endsAt },
                endsAt: { gt: r.startsAt },
              })),
            },
          ],
        },
        select: { startsAt: true, endsAt: true, roomId: true, coachId: true, nameSnapshot: true },
      }),
      coursePrisma.courseRoom.findFirst({
        where: { id: d.roomId, storeId },
        select: { capacity: true },
      }),
    ]);
    return {
      success: true as const,
      data: {
        dates: dates.map((r) => ({
          startsAt: r.startsAt.toISOString(),
          conflict: conflicts.some(
            (c) => c.startsAt < r.endsAt && c.endsAt > r.startsAt,
          ),
          conflicts: conflicts.filter(c => c.startsAt < r.endsAt && c.endsAt > r.startsAt).map(c => ({
            name: c.nameSnapshot,
            startsAt: c.startsAt.toISOString(),
            endsAt: c.endsAt.toISOString(),
            resource: [c.roomId === d.roomId ? "教室" : "", c.coachId === d.coachId ? "教練" : ""].filter(Boolean).join("及"),
          })),
        })),
        capacityWarning:
          room?.capacity && d.capacity > room.capacity
            ? `排課 ${d.capacity} 人超過教室容納 ${room.capacity} 人，請確認容量`
            : null,
      },
    };
  } catch (e) {
    return handleCourseActionError(e);
  }
}

export async function updateCourseSeries(input: unknown) {
  try {
    const { storeId } = await writableStore("booking.update");
    const d = courseScheduleInput
      .omit({ templateId: true, requestKey: true, repeatUntil: true })
      .extend({
        id: z.string().min(1),
        templateId: z.string().min(1).optional(),
        nameSnapshot: z.string().trim().min(1).max(80),
        pointCost: z.number().int().min(1).max(10000),
      })
      .parse(input);
    const [range] = buildCourseOccurrences({
      ...d,
      additionalDates: undefined,
      templateId: "series",
      requestKey: "00000000-0000-4000-8000-000000000000",
    });
    const { courseTransaction } =
      await import("@/server/services/course-access");
    await courseTransaction(storeId, async (tx) => {
      const source = await tx.courseSession.findFirst({
        where: { id: d.id, storeId, cancelledAt: null },
      });
      if (!source) throw new AppError("NOT_FOUND", "找不到本店課程");
      const [room, coaches, sessions] = await Promise.all([
        tx.courseRoom.findFirst({
          where: { id: d.roomId, storeId, isActive: true },
        }),
        tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM "Staff" WHERE id = ${d.coachId} AND "storeId" = ${storeId} AND status::text = 'ACTIVE'`,
        tx.courseSession.findMany({
          where: {
            storeId,
            requestKey: source.requestKey,
            startsAt: { gte: source.startsAt },
            cancelledAt: null,
          },
          include: {
            bookings: {
              where: { status: { not: "CANCELLED" } },
              include: { card: { select: { expiresAt: true } } },
            },
          },
          orderBy: { startsAt: "asc" },
        }),
      ]);
      if (!room || !coaches.length)
        throw new AppError("VALIDATION", "請選擇本店啟用的教室與教練");
      const shift = range.startsAt.getTime() - source.startsAt.getTime();
      const changes = sessions.map((s) => ({
        session: s,
        startsAt: new Date(s.startsAt.getTime() + shift),
        endsAt: new Date(
          s.startsAt.getTime() + shift + d.durationMinutes * 60000,
        ),
      }));
      for (const change of changes) {
        await assertCourseResources(tx,storeId,{...d,templateId:d.templateId ?? change.session.templateId},change.session);
        if (change.session.bookings.some((b) => b.status === "ATTENDED"))
          throw new AppError("CONFLICT", "包含已完成點名的課程，整批尚未修改");
        if (
          change.session.bookings.some(
            (b) => b.card && b.card.expiresAt < change.startsAt,
          )
        )
          throw new AppError(
            "CONFLICT",
            "新日期超過已預約方案期限，整批尚未修改",
          );
        if (
          change.session.bookings.length > d.capacity ||
          (change.session.bookings.length &&
            (change.session.pointCost !== d.pointCost || (d.templateId && d.templateId !== change.session.templateId)))
        )
          throw new AppError(
            "CONFLICT",
            "後續課程已有預約，容量或點數修改不適用；整批尚未修改",
          );
        const conflict = await tx.courseSession.findFirst({
          where: {
            storeId,
            id: { notIn: sessions.map((s) => s.id) },
            cancelledAt: null,
            startsAt: { lt: change.endsAt },
            endsAt: { gt: change.startsAt },
            OR: [{ roomId: d.roomId }, { coachId: d.coachId }],
          },
        });
        if (
          conflict ||
          changes.some(
            (other) =>
              other !== change &&
              other.startsAt < change.endsAt &&
              other.endsAt > change.startsAt,
          )
        )
          throw new AppError(
            "CONFLICT",
            `${formatTWDateTime(change.startsAt)} 撞期，整批尚未修改`,
          );
      }
      await assertCourseSessionsFitHours(tx,storeId,changes);
      await assertMusicCourseAvailability(tx,storeId,d.coachId,changes);
      await assertCourseDutyCoverage(tx,storeId,changes.map(s=>({...s,coachId:d.coachId})));
      // Exclusion constraints are immediate. Temporarily release only these
      // rows inside the same transaction; other writers use the store lock.
      await tx.courseSession.updateMany({
        where: { storeId, id: { in: sessions.map((s) => s.id) } },
        data: { cancelledAt: new Date() },
      });
      for (const c of changes)
        await tx.courseSession.update({
          where: { id: c.session.id },
          data: {
            startsAt: c.startsAt,
            endsAt: c.endsAt,
            roomId: d.roomId,
            coachId: d.coachId,
            pointCost: d.pointCost,
            capacity: d.capacity,
            nameSnapshot: d.nameSnapshot,
            templateId: d.templateId ?? c.session.templateId,
            cancelledAt: null,
          },
        });
    });
    revalidatePath("/dashboard/courses");
    revalidatePath("/dashboard");
    revalidatePath("/book");
    return { success: true as const };
  } catch (e) {
    return handleCourseActionError(e);
  }
}

/** Atomic catalogue bulk edit. Never copies sessions or bookings. */
export async function batchCourseTemplates(input: unknown) {
  try {
    const {storeId}=await writableStore("booking.update");
    const d=z.object({ids:z.array(z.string().min(1)).min(1).max(200),category:z.string().trim().max(40).optional(),visibility:z.enum(["PUBLIC","HIDDEN","OFF"]).optional()}).parse(input);
    const ids=[...new Set(d.ids)];
    await courseTransaction(storeId,async tx=>{
      if (await tx.courseTemplate.count({where:{storeId,id:{in:ids}}})!==ids.length) throw new AppError("FORBIDDEN","包含非本店課程，整批未修改");
      await tx.courseTemplate.updateMany({where:{storeId,id:{in:ids}},data:{...(d.category!==undefined?{category:d.category}:{}),...(d.visibility?{visibility:d.visibility,isActive:d.visibility!=="OFF"}:{})}});
    });
    revalidatePath("/dashboard/courses");revalidatePath("/book");
    return {success:true as const};
  } catch(e){return handleCourseActionError(e);}
}
