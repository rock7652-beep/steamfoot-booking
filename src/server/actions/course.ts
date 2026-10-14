"use server";
import {courseTrialPrice} from "@/lib/course-trial-price";
import { createHash } from "node:crypto";
import { courseTemplateSaveInput, courseTemplateRevision, savedCourseTemplate } from "@/lib/course-template-save";
import { settingsSaveUncertain } from "@/server/services/settings-save-error";
import {recordCourseStoreNotice} from "@/server/services/course-store-notices";
import { enqueueOperationAudit } from "@/server/services/operation-audit-outbox";
import {kickCoachNotifications} from "@/server/services/course-coach-notification-kick";
import { assertCourseDutyCoverage } from "@/server/services/course-duty";
import { assertMusicCourseAvailability, assertMusicCourseDuration } from "@/server/services/course-availability";
import { assertCourseSessionsFitHours } from "@/server/services/course-business-hours";

import { assertCourseResources, assertNoCourseResourceUse, handleCourseActionError } from "@/server/services/course-resources";
import { courseTransaction } from "@/server/services/course-access";
import { z } from "zod";
import { courseRoomEditInput, savedCourseRoom, courseRoomRevision, courseRoomInput } from "@/lib/course-room-input";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { coursePrisma } from "@/lib/course-db";
import { prisma } from "@/lib/db";
import { courseManager } from "@/server/services/course-access";
import { AppError } from "@/lib/errors";
import {
  buildCourseOccurrences,
  courseScheduleInput,
  courseTemplateInput,
} from "@/lib/course-scheduling";
import { findFixedSeriesConflicts, findOngoingFixedSeriesConflicts } from "@/lib/course-series";
import { formatTWDateTime, parseTaipeiDateTime, toLocalDateStr } from "@/lib/date-utils";

export async function scheduleTeacherMakeup(input: unknown) {
  try {
    const {user,storeId}=await writableStore("booking.create");
    const data=z.object({sourceSessionId:z.string().min(1),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),time:z.string().regex(/^([01]\d|2[0-3]):(?:00|30)$/),roomId:z.string().min(1),coachId:z.string().min(1)}).parse(input);
    const startsAt=parseTaipeiDateTime(data.date,data.time);
    if(!startsAt || startsAt <= new Date())throw new AppError("VALIDATION","請選擇未來的補課時段");
    const created=await courseTransaction(storeId,async(tx)=>{
      const source=await tx.courseSession.findFirst({where:{id:data.sourceSessionId,storeId,cancelledAt:null},include:{bookings:{where:{OR:[{status:{not:"CANCELLED"}},{absenceKind:"TEACHER_ABSENT"}]}}}});
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
      const collision=await tx.courseSession.findFirst({where:{storeId,cancelledAt:null,releasedAt:null,startsAt:{lt:endsAt},endsAt:{gt:startsAt},OR:[{roomId:data.roomId},{coachId:data.coachId}]}});
      if(collision)throw new AppError("CONFLICT",`${formatTWDateTime(collision.startsAt)} 教室或老師已有課程`);
      const seriesRules=await tx.courseScheduleSeries.findMany({where:{storeId,cancelledAt:null,startsAt:{lt:endsAt},OR:[{untilDate:null},{untilDate:{gte:new Date(`${toLocalDateStr(startsAt)}T00:00:00.000Z`)}}]}});
      const seriesConflict=findFixedSeriesConflicts(seriesRules,[range],{roomId:data.roomId,coachId:data.coachId})[0];
      if(seriesConflict)throw new AppError("CONFLICT",`${seriesConflict.date} · ${seriesConflict.reason}`);
      const session=await tx.courseSession.create({data:{storeId,templateId:source.templateId,roomId:data.roomId,coachId:data.coachId,nameSnapshot:`免費補課 · ${source.nameSnapshot}`,startsAt,endsAt,pointCost:0,capacity:source.capacity,requestKey:`teacher-makeup:${source.id}`,requestIndex:0,createdById:user.id,teacherMakeupForSessionId:source.id}});
      await tx.courseBooking.createMany({data:source.bookings.map(booking=>({storeId,sessionId:session.id,cardId:null,bookingKind:"TEACHER_MAKEUP",customerId:booking.customerId,operatorUserId:user.id,operatorCustomerId:null,operatorName:user.name??"店長",customerName:booking.customerName,pointCost:0,status:"RESERVED",notes:`原課 ${formatTWDateTime(source.startsAt)} 老師曠課補課`,requestKey:`teacher-makeup:${source.id}:${booking.customerId}`}))});
      return session.id;
    });
    kickCoachNotifications(storeId);revalidatePath("/dashboard/courses");revalidatePath("/dashboard");return {success:true as const,sessionId:created};
  }catch(error){return handleCourseActionError(error);}
}

async function writableStore(
  permission: "booking.create" | "booking.update" = "booking.create",
) {
  return courseManager(permission);
}

function scheduleCapacityWaitlistPromotion(
  storeId: string,
  sessionIds: string[],
  actor: { id: string; name?: string | null },
) {
  const uniqueSessionIds = [...new Set(sessionIds)].filter(Boolean);
  if (!uniqueSessionIds.length) return;
  after(async () => {
    try {
      const [
        { promoteCourseWaitlistForSession },
        { notifyCourseWaitlistPromotions },
      ] = await Promise.all([
        import("@/server/services/course-waitlist"),
        import("@/server/services/course-waitlist-notifications"),
      ]);
      for (const sessionId of uniqueSessionIds) {
        const promoted = await courseTransaction(storeId, tx =>
          promoteCourseWaitlistForSession(tx, storeId, sessionId),
         async (promoted, tx) => { if (promoted.length) await enqueueOperationAudit({
            actorUserId: actor.id,
            actorNameSnapshot: actor.name,
            storeId,
            module: "COURSE",
            targetType: "CourseWaitlist",
            targetId: sessionId,
            action: "CAPACITY_AUTO_PROMOTE",
            summary: `課程增額自動遞補（${promoted.length} 人）`,
            after: { bookingIds: promoted.map(item => item.bookingId) },
          }, tx, promoted.map(item=>item.bookingId).sort().join('|')); });
        if (!promoted.length) continue;
        await notifyCourseWaitlistPromotions(storeId, promoted);
      }
    } catch (error) {
      console.error("[course-waitlist] capacity promotion failed", {
        storeId,
        sessionIds: uniqueSessionIds,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

async function validateMusicTemplate(storeId:string,data:{classType:string|null;pointCost:number;musicPricePerLesson:number|null;musicTermLessons:number|null;musicValidityDaysPerTerm:number|null;musicScheduleMode:"FIXED"|"APPOINTMENT"|null;musicTrialMode:"FREE"|"PAID"|null;musicTeacherFeeBase:number|null;durationMinutes:number}) {
  const music=await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"},select:{storeId:true}});
  if (!music) return;
  if (!data.classType || data.musicPricePerLesson===null || data.musicTermLessons===null || data.musicValidityDaysPerTerm===null || !data.musicScheduleMode)
    throw new AppError("VALIDATION","音樂課程需設定課型、每堂售價、每期堂數、有效天數與排課方式");
  if (data.pointCost!==1) throw new AppError("VALIDATION","音樂課程只使用堂數，每次預約固定 1 堂");
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
        rentalEnabled: z.boolean().default(false),
        rentalHourlyRate: z.number().int().min(0).max(1000000).default(0),
        rentalBufferMinutes: z.number().int().min(0).max(120).default(0),
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
    kickCoachNotifications(storeId);revalidatePath("/dashboard/courses");revalidatePath("/dashboard");revalidatePath("/hq/dashboard/courses");
    revalidatePath("/book");
    return { success: true as const };
  } catch (error) {
    return handleCourseActionError(error);
  }
}

/** Room edits return committed values without waiting for the dashboard RSC. */
export async function saveCourseRoomSettings(input:unknown) {
  try {
    const {id,expectedStoreId,expectedRevision,requestKey,...fields}=courseRoomEditInput.parse(input);
    void requestKey; // Transport keeps the exact edit payload for an ambiguous retry.
    const {storeId}=await writableStore("booking.update");
    if(storeId!==expectedStoreId)throw new AppError("CONFLICT","目前門市已切換，請重新開啟空間設定。");
    const saved=await courseTransaction(storeId,async tx=>{
      const previous=await tx.courseRoom.findFirst({where:{id,storeId}});
      if(!previous)throw new AppError("NOT_FOUND","找不到本店空間");
      if(courseRoomRevision(previous)!==expectedRevision){
        if(JSON.stringify(courseRoomInput.parse(previous))===JSON.stringify(fields))return previous;
        throw new AppError("CONFLICT","空間已有更新，輸入已保留。請核對目前資料後再編輯。");
      }
      if(fields.capacity!==null&&(previous.capacity===null||fields.capacity<previous.capacity))
        await assertNoCourseResourceUse(tx,storeId,{roomId:id,capacity:fields.capacity});
      const updated=await tx.courseRoom.updateMany({where:{id,storeId,...courseRoomInput.parse(previous),isActive:previous.isActive},data:fields});
      if(!updated.count)throw new AppError("CONFLICT","空間已有更新，請重新核對。");
      return tx.courseRoom.findFirstOrThrow({where:{id,storeId}});
    });
    const data=savedCourseRoom.parse(saved);
    let syncWarning=false;
    try{revalidatePath("/dashboard/courses");revalidatePath("/dashboard");revalidatePath("/hq/dashboard/courses");revalidatePath("/book");}catch{syncWarning=true;}
    return {success:true as const,storeId,data,syncWarning};
  }catch(error){return {...handleCourseActionError(error),uncertain:settingsSaveUncertain(error)};}
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
    kickCoachNotifications(storeId);revalidatePath("/dashboard/courses");
    revalidatePath("/dashboard");
    revalidatePath("/hq/dashboard/courses");
    revalidatePath("/book");
    return { success: true as const };
  } catch (error) {
    return handleCourseActionError(error);
  }
}

export async function deleteUnusedCourseTemplate(input: unknown) {
  try {
    const {user,storeId}=await writableStore("booking.update");
    const {id}=z.object({id:z.string().min(1).max(100)}).parse(input);
    await courseTransaction(storeId,async tx=>{
      const template=await tx.courseTemplate.findFirst({where:{id,storeId},select:{id:true}});
      if(!template)throw new AppError("NOT_FOUND","找不到本店課程");
      const uses=await Promise.all([
        tx.courseSession.count({where:{storeId,templateId:id}}),
        tx.coursePointPlan.count({where:{storeId,templateIds:{has:id}}}),
        tx.coursePointCard.count({where:{storeId,templateIds:{has:id}}}),
        tx.coursePurchase.count({where:{storeId,templateIds:{has:id}}}),
        tx.courseCompensation.count({where:{storeId,templateId:id}}),
      ]);
      if(uses.some(Boolean))throw new AppError("VALIDATION","此課程已有排課、方案或拆帳設定，請使用下架保留紀錄");
      await tx.courseTemplate.delete({where:{id,storeId}});
      await enqueueOperationAudit({actorUserId:user.id,storeId,module:"COURSE",targetType:"CourseTemplate",targetId:id,action:"DELETE",summary:"刪除未使用課程"},tx);
    });
    kickCoachNotifications(storeId);revalidatePath("/dashboard/courses");revalidatePath("/book");
    return {success:true as const};
  }catch(error){return handleCourseActionError(error);}
}

export async function updateCourseSession(input: unknown) {
  try {
    const { user, storeId } = await writableStore("booking.update");
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
    const capacityIncreased = await coursePrisma.$transaction(
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
          throw new AppError("VALIDATION", "請選擇本店有效的排課、教室與授課人員");
        await assertCourseResources(tx,storeId,{...data,templateId:data.templateId ?? session.templateId},session);
        if(data.templateId&&data.templateId!==session.templateId){const {ensureMusicTeachingItem}=await import("@/server/services/music-teaching-item");await ensureMusicTeachingItem(tx,storeId,data.templateId);}
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
            releasedAt: null,
            startsAt: { lt: range.endsAt },
            endsAt: { gt: range.startsAt },
            OR: [{ roomId: data.roomId }, { coachId: data.coachId }],
          },
          orderBy: { startsAt: "asc" },
        });
        if (conflict)
          throw new AppError(
            "CONFLICT",
            `${formatTWDateTime(conflict.startsAt)} ${conflict.roomId === data.roomId ? "教室" : "授課人員"}已有課程，尚未儲存修改`,
          );
        const fixedRules = await tx.courseScheduleSeries.findMany({
          where: { storeId, cancelledAt: null, requestKey: { not: session.requestKey }, startsAt: { lt: range.endsAt },
            OR: [{ untilDate: null }, { untilDate: { gte: new Date(`${toLocalDateStr(range.startsAt)}T00:00:00.000Z`) } }],
          },
        });
        const recurringConflict = findFixedSeriesConflicts(fixedRules, [range], { roomId: data.roomId, coachId: data.coachId })[0];
        if (recurringConflict) throw new AppError("CONFLICT", `${recurringConflict.date} · ${recurringConflict.reason}，尚未儲存修改`);
        await assertCourseSessionsFitHours(tx,storeId,[range]);
        if(session.coachId!==data.coachId || +session.startsAt!==+range.startsAt || +session.endsAt!==+range.endsAt)
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
        if (session.scheduleType === "FIXED") {
          const rule = await tx.courseScheduleSeries.findUnique({ where: { storeId_requestKey: { storeId, requestKey: session.requestKey } } });
          if (rule) {
            const excluded = new Set(rule.excludedDates);
            const originalDate = toLocalDateStr(session.startsAt);
            const unchanged = +range.startsAt === +session.startsAt && +range.endsAt === +session.endsAt && data.roomId === session.roomId && data.coachId === session.coachId;
            if (unchanged) excluded.delete(originalDate); else excluded.add(originalDate);
            await tx.courseScheduleSeries.update({ where: { id: rule.id }, data: { excludedDates: [...excluded] } });
          }
        }
        if(bookings.length&&(range.startsAt.getTime()!==session.startsAt.getTime()||range.endsAt.getTime()!==session.endsAt.getTime()||data.coachId!==session.coachId))await recordCourseStoreNotice(tx,{storeId,userId:user.id,name:user.name??"門市人員"},{subjectKey:`session:${session.id}`,kind:"MOVE",customerName:data.nameSnapshot,courseName:data.nameSnapshot,coachId:data.coachId,previousCoachId:session.coachId,startsAt:range.startsAt,previousStartsAt:session.startsAt,affectedCount:bookings.length,details:{students:bookings.map(b=>b.customerName)}});
        return data.capacity > session.capacity ? session.id : null;
      },
      { timeout: 15000 },
    );
    if (capacityIncreased) scheduleCapacityWaitlistPromotion(storeId, [capacityIncreased], user);
    kickCoachNotifications(storeId);revalidatePath("/dashboard/courses");
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
    const { name, category, capacity, details, equipment, location, rentalEnabled, rentalHourlyRate, rentalBufferMinutes } = courseRoomInput
      .parse(typeof input === "string" ? { name: input } : input);
    const room = await coursePrisma.courseRoom.create({
      data: { name, category, capacity, details, equipment, location, storeId, rentalEnabled, rentalHourlyRate, rentalBufferMinutes },
      select: { id: true, name: true },
    });
    kickCoachNotifications(storeId);revalidatePath("/dashboard/courses");
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
    kickCoachNotifications(storeId);revalidatePath("/dashboard/courses");
    revalidatePath("/dashboard");
    return { success: true as const };
  } catch (error) {
    return handleCourseActionError(error);
  }
}

/** Direct catalog transport; the response contains only the committed configuration. */
export async function saveCourseTemplateSettings(input: unknown) {
  try {
    const {id, expectedStoreId, requestKey, expectedRevision, ...fields} = courseTemplateSaveInput.parse(input);
    const {storeId} = await writableStore(id ? "booking.update" : "booking.create");
    if (storeId !== expectedStoreId) throw new AppError("CONFLICT", "目前門市已切換，請重新開啟課程設定。");
    if(id?.startsWith("teaching"))throw new AppError("VALIDATION","教學項目請從教學項目設定修改，不能當作學費方案編輯");
    const rowId = id ?? `template_${createHash("sha256").update(JSON.stringify([storeId,requestKey])).digest("hex")}`;
    const include = {musicSubject:{select:{id:true,name:true,isActive:true}},_count:{select:{sessions:true}}} as const;
    const saved = await courseTransaction(storeId, async tx => {
      const previous = await tx.courseTemplate.findFirst({where:{id:rowId,storeId},include});
      if (id && !previous) throw new AppError("NOT_FOUND", "找不到本店課程，請重新開啟設定。");
      if (previous && (!id || courseTemplateRevision(previous) !== expectedRevision)) {
        if (JSON.stringify(courseTemplateInput.parse(previous)) === JSON.stringify(fields)) return previous;
        throw new AppError("CONFLICT", "課程已有更新，輸入已保留。請核對目前資料後再編輯。");
      }
      await validateMusicTemplate(storeId,fields);
      await assertMusicCourseDuration(tx,storeId,fields.durationMinutes);
      if (previous && previous.classType !== fields.classType && previous._count.sessions)
        throw new AppError("VALIDATION", "已排課的課型不能變更；請複製課程另建自組班或團體班");
      if (fields.defaultRoomId && !await tx.courseRoom.findFirst({where:{id:fields.defaultRoomId,storeId,isActive:true},select:{id:true}}))
        throw new AppError("VALIDATION", "請選擇本店可使用的教室");
      if (!id) return tx.courseTemplate.create({data:{...fields,id:rowId,storeId},include});
      // Also guard writers that do not acquire the store lock.
      const updated = await tx.courseTemplate.updateMany({where:{id,storeId,updatedAt:previous!.updatedAt},data:fields});
      if (!updated.count) throw new AppError("CONFLICT", "課程已有更新，輸入已保留。請重新核對。");
      return tx.courseTemplate.findFirstOrThrow({where:{id,storeId},include});
    });
    const data = savedCourseTemplate.parse({...saved,hasSessions:saved._count.sessions>0,revision:courseTemplateRevision(saved)});
    let syncWarning = false;
    try {
      revalidatePath("/dashboard/courses");revalidatePath("/dashboard");revalidatePath("/hq/dashboard/courses");revalidatePath("/book");
    } catch { syncWarning = true; }
    return {success:true as const,storeId,data,syncWarning};
  } catch (error) { return {...handleCourseActionError(error),uncertain:settingsSaveUncertain(error)}; }
}

export async function createCourseSchedule(input: unknown) {
  try {
    const { user, storeId } = await writableStore();
    const data = courseScheduleInput
      .extend({ sourceSessionId: z.string().min(1).optional(), learners:z.array(z.object({customerId:z.string().min(1).max(100).nullable(),participantKey:z.string().uuid().optional(),customerName:z.string().trim().min(1).max(80).optional(),customerPhone:z.string().regex(/^09\d{8}$/).optional(),cardId:z.string().min(1).max(100).nullable(),trialPrice:z.number().int().min(0).max(1000000).optional()})).max(500).default([]) })
      .parse(input);
    const musicScheduling = data.enrollmentMode !== undefined;
    if (musicScheduling) {
      const music = await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"},select:{storeId:true}});
      if (!music) throw new AppError("FORBIDDEN","此排課流程僅適用音樂模組");
      if (data.enrollmentMode === "ASSIGNED" && !data.learners.length) throw new AppError("VALIDATION","請指定至少一位學員");
      if (data.enrollmentMode === "OPEN" && data.learners.length) throw new AppError("VALIDATION","開放報名建立時不指定學員");
      if (data.enrollmentMode === "ASSIGNED") data.capacity = data.learners.length;
      if (data.learners.length) {
        await courseManager("customer.read");
        const {getManagerCustomerWhere}=await import("@/lib/manager-visibility");
        const ids=data.learners.flatMap(row=>row.customerId?[row.customerId]:[]);
        const visible=await prisma.customer.count({where:{...getManagerCustomerWhere(user.role,user.staffId,storeId),storeId,id:{in:ids},mergedIntoCustomerId:null}});
        if (visible!==new Set(ids).size) throw new AppError("FORBIDDEN","請選擇有權限查看的本店學員");
      }
      if(!data.isTrial&&data.learners.some(row=>row.trialPrice!==undefined||!row.customerId))throw new AppError("VALIDATION","正式課請選已建檔學員，體驗者請使用體驗課");
      if(data.scheduleType==="FIXED"&&!["WEEKLY","BIWEEKLY"].includes(data.scheduleFrequency))throw new AppError("VALIDATION","請選每週或隔週");
      const cards=data.learners.flatMap(row=>row.cardId?[row.cardId]:[]);
      if(new Set(cards).size!==cards.length)throw new AppError("VALIDATION","音樂團體班每位學員須使用自己的方案");
    }
    const newTrialLearners=data.learners.filter(row=>!row.customerId&&row.customerPhone);
    if(newTrialLearners.length){await courseManager("customer.create");await courseManager("customer.read");if(!data.isTrial)throw new AppError("VALIDATION","新體驗者請使用體驗課");if(new Set(newTrialLearners.map(row=>row.customerPhone)).size!==newTrialLearners.length)throw new AppError("VALIDATION","同一手機不可重複加入體驗名單");}
    let trialPricing: Awaited<ReturnType<typeof import("@/lib/shop-config").getTrialSettings>> | undefined;
    if(data.isTrial||data.learners.some(learner=>learner.cardId===null && (!musicScheduling || data.isTrial || learner.trialPrice!==undefined))){
      await courseManager("trial.create");
      const {getTrialSettings}=await import("@/lib/shop-config");
      trialPricing=await getTrialSettings(storeId);
      if(!trialPricing.trialEnabled)throw new AppError("FORBIDDEN","店家體驗功能已關閉");
      const {readTeachingTrialPrice}=await import("@/server/services/music-teaching-item");
      const trialTemplate=await readTeachingTrialPrice(coursePrisma,storeId,data.templateId);
      data.learners=data.learners.map(learner=>learner.cardId===null && (!musicScheduling || data.isTrial || learner.trialPrice!==undefined)?{...learner,trialPrice:courseTrialPrice(musicScheduling&&data.isTrial?undefined:learner.trialPrice,trialPricing!,trialTemplate??undefined)}:learner);
    }
    if(data.learners.some(learner=>!learner.customerId&&(learner.cardId!==null||!learner.participantKey||!learner.customerName)))throw new AppError("VALIDATION","體驗者資料不完整");
    if(new Set(data.learners.map(learner=>learner.customerId??learner.participantKey)).size!==data.learners.length)throw new AppError("VALIDATION","同一學員不能重複加入");
    if(data.learners.length>data.capacity)throw new AppError("VALIDATION","學員人數超過課程名額");
    const enrollmentFingerprint=musicScheduling?createHash("sha256").update(JSON.stringify({mode:data.enrollmentMode,learners:data.learners.map(row=>({customerId:row.customerId,participantKey:row.participantKey,cardId:row.cardId,trialPrice:row.trialPrice,customerName:row.customerName,customerPhone:row.customerPhone})).sort((a,b)=>(a.customerId??a.participantKey??"").localeCompare(b.customerId??b.participantKey??""))})).digest("hex"):null;
    const limits=data.learners.length ? await (await import("@/lib/feature-gate")).getStoreLimitsByStoreId(storeId) : null;
    let occurrences: ReturnType<typeof buildCourseOccurrences>;
    try {
      occurrences = buildCourseOccurrences(data);
      if(data.isTrial&&occurrences.length>1)throw new Error("體驗課僅能安排一次");
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
        if(musicScheduling){const {ensureMusicTeachingItem}=await import("@/server/services/music-teaching-item");await ensureMusicTeachingItem(tx,storeId,data.templateId,trialPricing?.trialDefaultPrice??0);}
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
                session.isTrial !== data.isTrial ||
                (session.scheduleType ?? "LEGACY") !== data.scheduleType ||
                (session.enrollmentMode ?? "OPEN") !== (data.enrollmentMode ?? "OPEN") ||
                (musicScheduling && session.enrollmentFingerprint !== enrollmentFingerprint) ||
                (session.scheduleFrequency ?? "NONE") !== data.scheduleFrequency ||
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
          const enrolled=await tx.courseBooking.findMany({where:{storeId,requestKey:{startsWith:`schedule:${data.requestKey}:`}},select:{sessionId:true,customerId:true,customerName:true,cardId:true,trialPrice:true,requestKey:true,bookingKind:true}});
          const expected=existing.flatMap((session,index)=>data.learners.filter(learner=>index===0||learner.cardId!==null||musicScheduling&&!data.isTrial&&learner.trialPrice===undefined).map(learner=>({session,learner})));
          if(!musicScheduling&&(enrolled.length!==expected.length||expected.some(({session,learner})=>!enrolled.some(booking=>booking.sessionId===session.id&&booking.customerId===learner.customerId&&(booking.cardId===learner.cardId||musicScheduling&&booking.bookingKind==="UNPAID")&&(learner.cardId!==null||booking.trialPrice===(learner.trialPrice??null))&&(!learner.participantKey||booking.requestKey===`schedule:${data.requestKey}:${session.id}:${learner.participantKey}`)))))throw new AppError("CONFLICT","這次排課已送出，學員或方案不同，請重新開啟排課");
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
            include: { musicSubject: { select: { name: true, isActive: true } } },
          }),
          tx.courseRoom.findFirst({
            where: { id: data.roomId, storeId, isActive: true },
            select: { id: true },
          }),
          tx.$queryRaw<
            Array<{ id: string }>
          >`SELECT id FROM "Staff" WHERE id = ${data.coachId} AND "storeId" = ${storeId} AND status::text = 'ACTIVE'`,
        ]);
        if (!template || template.musicSubject?.isActive === false || template.visibility === "OFF" || !room || !coaches.length)
          throw new AppError("VALIDATION", "請選擇本店有效的課程、教室與授課人員");
        await assertCourseResources(tx,storeId,{...data,requireMusicSubject:musicScheduling});
        if(musicScheduling&&data.scheduleType==="FIXED"){
          const [rules,occupied,rentals]=await Promise.all([
            tx.courseScheduleSeries.findMany({where:{storeId,cancelledAt:null}}),
            tx.courseSession.findMany({where:{storeId,cancelledAt:null,releasedAt:null,endsAt:{gt:occurrences[0].startsAt},OR:[{roomId:data.roomId},{coachId:data.coachId}]},select:{startsAt:true,endsAt:true,roomId:true,coachId:true}}),
            tx.courseRental.findMany({where:{storeId,roomId:data.roomId,cancelledAt:null,occupiedEndsAt:{gt:occurrences[0].startsAt}},select:{occupiedStartsAt:true,occupiedEndsAt:true}}),
          ]);
          const issues=findOngoingFixedSeriesConflicts({requestKey:data.requestKey,roomId:data.roomId,coachId:data.coachId,startsAt:occurrences[0].startsAt,endsAt:occurrences[0].endsAt,frequency:data.scheduleFrequency,untilDate:null,excludedDates:[],cancelledAt:null},rules,[...occupied,...rentals.map(row=>({startsAt:row.occupiedStartsAt,endsAt:row.occupiedEndsAt,roomId:data.roomId}))]);
          if(issues.length)throw new AppError("CONFLICT",issues.map(issue=>`${issue.date} · ${issue.reason}`).join("；"));
        }
        const conflict = await tx.courseSession.findFirst({
          where: {
            storeId,
            cancelledAt: null,
            releasedAt: null,
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
            `${formatTWDateTime(conflict.startsAt)} ${conflict.roomId === data.roomId ? "教室" : "授課人員"}已有課程，整批尚未建立`,
          );
        const fixedRules = await tx.courseScheduleSeries.findMany({
          where: {
            storeId,
            cancelledAt: null,
            startsAt: { lt: occurrences[occurrences.length - 1].endsAt },
            OR: [
              { untilDate: null },
              { untilDate: { gte: new Date(`${toLocalDateStr(occurrences[0].startsAt)}T00:00:00.000Z`) } },
            ],
          },
        });
        const ruleConflict = findFixedSeriesConflicts(
          fixedRules,
          occurrences,
          { roomId: data.roomId, coachId: data.coachId },
          data.requestKey,
        )[0];
        if (ruleConflict)
          throw new AppError("CONFLICT", `${ruleConflict.date} · ${ruleConflict.reason}，整批尚未建立`);
        const rental=await tx.courseRental.findFirst({where:{storeId,roomId:data.roomId,cancelledAt:null,OR:occurrences.map(range=>({occupiedStartsAt:{lt:range.endsAt},occupiedEndsAt:{gt:range.startsAt}}))},select:{occupiedStartsAt:true}});
        if(rental)throw new AppError("CONFLICT",`${formatTWDateTime(rental.occupiedStartsAt)} 教室已有租借，整批尚未建立`);
        // A moved fixed lesson still owns its original recurring slot. A one-off
        // lesson may use the released occurrence, but a new fixed series may not.
        if (data.scheduleType === "FIXED" || (data.scheduleType === "LEGACY" && (occurrences.length > 1 || template.musicScheduleMode === "FIXED"))) {
          const movedOrigins = await tx.courseSession.findMany({
            where: {
              storeId,
              cancelledAt: null,
              OR: [
                { rescheduledFromStartsAt: { lt: occurrences[occurrences.length - 1].endsAt }, rescheduledFromEndsAt: { gt: occurrences[0].startsAt }, OR: [{ rescheduledFromRoomId: data.roomId }, { rescheduledFromCoachId: data.coachId }] },
                { releasedAt: { not: null }, startsAt: { lt: occurrences[occurrences.length - 1].endsAt }, endsAt: { gt: occurrences[0].startsAt }, OR: [{ roomId: data.roomId }, { coachId: data.coachId }] },
              ],
            },
            select: {
              requestKey: true,
              releasedAt: true, startsAt: true, endsAt: true, roomId: true, coachId: true,
              rescheduledFromStartsAt: true,
              rescheduledFromEndsAt: true,
              rescheduledFromRoomId: true,
              rescheduledFromCoachId: true,
              template: { select: { musicScheduleMode: true } },
            },
          });
          const recurringKeys = movedOrigins.length ? new Set((await tx.courseSession.groupBy({
            by: ["requestKey"],
            where: { storeId, cancelledAt: null, requestKey: { in: [...new Set(movedOrigins.map((item) => item.requestKey))] } },
            _count: { id: true },
            having: { id: { _count: { gt: 1 } } },
          })).map((row) => row.requestKey)) : new Set<string>();
          const fixedOrigin = movedOrigins.find((item) =>
            (item.template.musicScheduleMode === "FIXED" || recurringKeys.has(item.requestKey)) &&
            occurrences.some((range) =>
              (item.releasedAt
                ? item.startsAt < range.endsAt && item.endsAt > range.startsAt && (item.roomId === data.roomId || item.coachId === data.coachId)
                : item.rescheduledFromStartsAt && item.rescheduledFromEndsAt && item.rescheduledFromStartsAt < range.endsAt && item.rescheduledFromEndsAt > range.startsAt &&
                  (item.rescheduledFromRoomId === data.roomId || item.rescheduledFromCoachId === data.coachId)),
            ),
          );
          if (fixedOrigin) throw new AppError("CONFLICT", "原固定課保留此時段；可排單次臨時課，不可再排固定課");
        }
        await assertCourseSessionsFitHours(tx,storeId,occurrences);
        await assertMusicCourseAvailability(tx,storeId,data.coachId,occurrences);
        await assertCourseDutyCoverage(tx,storeId,occurrences.map(s=>({...s,coachId:data.coachId})));
        if(musicScheduling)await tx.courseSession.updateMany({where:{storeId,rescheduleShadowHidden:false,rescheduledFromStartsAt:{not:null},OR:occurrences.map(range=>({rescheduledFromStartsAt:{lt:range.endsAt},rescheduledFromEndsAt:{gt:range.startsAt},OR:[{rescheduledFromRoomId:data.roomId},{rescheduledFromCoachId:data.coachId}]}))},data:{rescheduleShadowHidden:true}});
        await tx.courseSession.createMany({
          data: occurrences.map((range, requestIndex) => ({
            ...range,
            storeId,
            isTrial:data.isTrial,
            scheduleType:data.scheduleType,
            scheduleFrequency:data.scheduleFrequency,
            templateId: template.id,
            nameSnapshot: source?.nameSnapshot ?? template.musicSubject?.name ?? template.name,
            roomId: room.id,
            coachId: data.coachId,
            pointCost: source?.pointCost ?? template.pointCost,
            capacity: data.capacity,
            enrollmentMode: data.enrollmentMode ?? "OPEN",
            enrollmentFingerprint,
            requestKey: data.requestKey,
            requestIndex,
            createdById: user.id,
          })),
        });
        if (data.scheduleType === "FIXED" && (data.scheduleFrequency === "WEEKLY" || data.scheduleFrequency === "BIWEEKLY")) {
          await tx.courseScheduleSeries.create({
            data: {
              storeId,
              requestKey: data.requestKey,
              templateId: template.id,
              nameSnapshot: source?.nameSnapshot ?? template.musicSubject?.name ?? template.name,
              roomId: room.id,
              coachId: data.coachId,
              startsAt: occurrences[0].startsAt,
              endsAt: occurrences[0].endsAt,
              pointCost: source?.pointCost ?? template.pointCost,
              capacity: data.capacity,
              frequency: data.scheduleFrequency,
              enrollmentMode: data.enrollmentMode ?? "OPEN",
              learnerSnapshot: musicScheduling ? data.learners.filter(row=>row.customerId&&!data.isTrial&&row.trialPrice===undefined).map(row=>({customerId:row.customerId,cardId:row.cardId})) : [],
              untilDate: data.fixedUntil ? new Date(`${data.fixedUntil}T00:00:00.000Z`) : null,
              generatedThrough: new Date(`${toLocalDateStr(occurrences[occurrences.length - 1].startsAt)}T00:00:00.000Z`),
              createdById: user.id,
            },
          });
        }
        if(data.learners.length){
          const created=await tx.courseSession.findMany({where:{storeId,requestKey:data.requestKey,cancelledAt:null},orderBy:{requestIndex:"asc"},select:{id:true}});
          if(created.length!==occurrences.length)throw new AppError("CONFLICT","排課結果未完整確認，請重試");
          const {reserveCourseInTransaction}=await import("@/server/services/course-booking");
          const trialCustomerIds=new Map<string,string>();
          for(const learner of newTrialLearners){
            const {getManagerCustomerWhere}=await import("@/lib/manager-visibility");
            const visibility=getManagerCustomerWhere(user.role,user.staffId,storeId);
            const existing=await tx.$queryRaw<Array<{id:string;assignedStaffId:string|null}>>`SELECT id,"assignedStaffId" FROM "Customer" WHERE "storeId"=${storeId} AND phone=${learner.customerPhone!} AND "mergedIntoCustomerId" IS NULL`;
            if(existing.length){if(visibility.assignedStaffId&&existing[0].assignedStaffId!==visibility.assignedStaffId)throw new AppError("FORBIDDEN","此手機已有學員，請由有權限人員核對");trialCustomerIds.set(learner.participantKey!,existing[0].id);continue;}
            if(limits!.maxCustomers!==null){const counts=await tx.$queryRaw<Array<{count:bigint}>>`SELECT count(*) AS count FROM "Customer" WHERE "storeId"=${storeId} AND "mergedIntoCustomerId" IS NULL`;if(Number(counts[0].count)>=limits!.maxCustomers)throw new AppError("FORBIDDEN","已達顧客額度上限");}
            const customerId=`trial:${learner.participantKey}`;
            await tx.$executeRaw`INSERT INTO "Customer" (id,"storeId",name,phone,"assignedStaffId","updatedAt") VALUES (${customerId},${storeId},${learner.customerName!},${learner.customerPhone!},${typeof visibility.assignedStaffId==="string"?visibility.assignedStaffId:null},NOW())`;
            await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","storeId",module,summary,"targetType","targetId",action,"afterJson","createdAt") VALUES (${crypto.randomUUID()},${user.id},${storeId},'COURSE','體驗排課新增學員','Customer',${customerId},'CREATE_CUSTOMER',${JSON.stringify({storeId,name:learner.customerName,phone:learner.customerPhone})}::jsonb,NOW())`;
            trialCustomerIds.set(learner.participantKey!,customerId);
          }
          for(const [index,session] of created.entries())for(const learner of data.learners){
            const deferredRegular=musicScheduling&&!data.isTrial&&learner.trialPrice===undefined;
            if(index>0&&learner.cardId===null&&!deferredRegular)continue;
            if(deferredRegular){
              const {reserveScheduledMusicLearner}=await import("@/server/services/music-schedule-enrollment");
              await reserveScheduledMusicLearner(tx,{storeId,userId:user.id,name:user.name??"店長"},{sessionId:session.id,customerId:learner.customerId!,cardId:learner.cardId,requestKey:`schedule:${data.requestKey}:${session.id}:${learner.customerId}`},limits!.maxMonthlyBookings);
              continue;
            }
            await reserveCourseInTransaction(tx,{storeId,userId:user.id,name:user.name??"店長"},{sessionId:session.id,customerId:learner.customerId??trialCustomerIds.get(learner.participantKey!)??null,customerName:learner.customerName,cardId:learner.cardId,trialPrice:learner.cardId===null?learner.trialPrice:undefined,requestKey:`schedule:${data.requestKey}:${session.id}:${learner.customerId??learner.participantKey}`},limits!.maxMonthlyBookings);
          }
        }
        if(data.templateId.startsWith("teaching:")){const {captureTeachingTuitionFees}=await import("@/server/services/music-teaching-item");await captureTeachingTuitionFees(tx,storeId,data.requestKey);}
        return { count: occurrences.length };
      },
      { timeout: 15000 },
    );
    kickCoachNotifications(storeId);
    if(!musicScheduling){revalidatePath("/dashboard/courses");revalidatePath("/dashboard");revalidatePath("/hq/dashboard/courses");}
    const firstSession = await coursePrisma.courseSession.findFirst({
      where: { storeId, requestKey: data.requestKey, cancelledAt: null },
      orderBy: { requestIndex: "asc" },
      select: { id: true },
    });
    const savedSessions = await coursePrisma.courseSession.findMany({
      where: { storeId, requestKey: data.requestKey, cancelledAt: null },
      orderBy: { requestIndex: "asc" },
      include: { bookings: true, template: { select: { musicScheduleMode: true, musicSubject: { select: { name: true } } } } },
    });
    const sessions = savedSessions.map(session => ({
      id: session.id, templateId: session.templateId, nameSnapshot: session.nameSnapshot,
      startsAt: session.startsAt.toISOString(), endsAt: session.endsAt.toISOString(),
      coachId: session.coachId, roomId: session.roomId, capacity: session.capacity,
      pointCost: session.pointCost, isTrial: session.isTrial, requestKey: session.requestKey,
      scheduleType: session.scheduleType,
      isBiweekly: session.scheduleFrequency === "BIWEEKLY",
      isFixed: session.scheduleType === "FIXED" || (session.scheduleType === "LEGACY" && (result.count > 1 || session.template.musicScheduleMode === "FIXED")),
      bookings: session.bookings.map(booking => ({
        id: booking.id, customerId: booking.customerId, customerName: booking.customerName,
        status: booking.status, bookingKind: booking.bookingKind,
        checkedInAt: booking.checkedInAt?.toISOString() ?? null,
      })),
    }));
    return { success: true as const, data: { ...result, sessionId: firstSession?.id ?? null, sessions } };
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

    const musicStore=!!await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"},select:{storeId:true}});
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
      const original = source.rescheduledFromStartsAt
        ? formatTWDateTime(source.rescheduledFromStartsAt)
        : null;
      const restoring = d.scope === "SINGLE" && Boolean(
        original && d.date === original.slice(0, 10) && d.time === original.slice(11, 16) &&
        d.roomId === source.rescheduledFromRoomId && d.coachId === source.rescheduledFromCoachId,
      );
      if (d.restore) {
        if (d.scope !== "SINGLE" || !source.rescheduledFromStartsAt || !source.rescheduledFromRoomId || !source.rescheduledFromCoachId)
          throw new AppError("VALIDATION", "這堂課目前沒有可還原的原時段");
        if (!restoring)
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
      const recurringRule = await tx.courseScheduleSeries.findUnique({ where: { storeId_requestKey: { storeId, requestKey: source.requestKey } } });

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
            releasedAt: null,
            startsAt: { lt: change.endsAt },
            endsAt: { gt: change.startsAt },
            OR: [{ roomId: d.roomId }, { coachId: d.coachId }],
          },
          select: { startsAt: true, roomId: true, coachId: true },
        });
        if (conflict)
          throw new AppError("CONFLICT", restoring
            ? `原時段${conflict.roomId === d.roomId ? "教室" : "老師"}已有課；請先處理占用課程，再恢復原課`
            : `${formatTWDateTime(change.startsAt)} ${conflict.roomId === d.roomId ? "教室" : "老師"}已有課`);
      }
      const externalRules = await tx.courseScheduleSeries.findMany({
        where: { storeId, cancelledAt: null, ...(recurringRule ? { id: { not: recurringRule.id } } : {}),
          startsAt: { lt: changes[changes.length - 1].endsAt },
          OR: [{ untilDate: null }, { untilDate: { gte: new Date(`${toLocalDateStr(changes[0].startsAt)}T00:00:00.000Z`) } }],
        },
      });
      const recurringConflict = findFixedSeriesConflicts(externalRules, changes, { roomId: d.roomId, coachId: d.coachId })[0];
      if (recurringConflict) throw new AppError("CONFLICT", `${recurringConflict.date} · ${recurringConflict.reason}`);

      await assertCourseSessionsFitHours(tx, storeId, changes);
      await assertMusicCourseAvailability(tx, storeId, d.coachId, changes);
      await assertCourseDutyCoverage(tx, storeId, changes.map((change) => ({ ...change, coachId: d.coachId })));

      await tx.courseSession.updateMany({
        where: { storeId, id: { in: selectedIds } },
        data: { cancelledAt: new Date() },
      });

      const movedAt = new Date();
      for (const change of changes) {
        const temporary = !restoring;
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
            rescheduleShadowHidden: temporary&&change.session.rescheduledFromStartsAt?change.session.rescheduleShadowHidden:false,
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
      if (recurringRule) {
        if (d.scope === "FUTURE") {
          await tx.courseScheduleSeries.update({ where: { id: recurringRule.id }, data: {
            startsAt: changes[0].startsAt,
            endsAt: new Date(changes[0].startsAt.getTime() + duration),
            roomId: d.roomId,
            coachId: d.coachId,
            generatedThrough: new Date(`${toLocalDateStr(changes[changes.length - 1].startsAt)}T00:00:00.000Z`),
            generationError: null,
          } });
        } else {
          const excluded = new Set(recurringRule.excludedDates);
          for (const change of changes) {
            const sourceDate = toLocalDateStr(change.session.startsAt);
            const targetDate = toLocalDateStr(change.startsAt);
            if (restoring) excluded.delete(targetDate);
            else excluded.add(sourceDate);
          }
          await tx.courseScheduleSeries.update({ where: { id: recurringRule.id }, data: { excludedDates: [...excluded] } });
        }
      }
      for(const change of changes){
        const students=await tx.courseBooking.findMany({where:{storeId,sessionId:change.session.id,status:{not:"CANCELLED"}},select:{customerName:true}});
        if(students.length)await recordCourseStoreNotice(tx,{storeId,userId:user.id,name:user.name??"門市人員"},{subjectKey:`session:${change.session.id}`,kind:"MOVE",customerName:change.session.nameSnapshot,courseName:change.session.nameSnapshot,coachId:d.coachId,previousCoachId:change.session.coachId,startsAt:change.startsAt,previousStartsAt:change.session.startsAt,affectedCount:students.length,details:{students:students.map(s=>s.customerName)}});
      }
      if(source.templateId.startsWith("teaching:")){const {captureTeachingTuitionFees}=await import("@/server/services/music-teaching-item");await captureTeachingTuitionFees(tx,storeId,source.requestKey,selectedIds);}
      const updated=await tx.courseSession.findMany({where:{storeId,id:{in:selectedIds},cancelledAt:null},include:{bookings:true}});
      return { count: changes.length, sessions:updated.map(session=>({...session,startsAt:session.startsAt.toISOString(),endsAt:session.endsAt.toISOString(),rescheduledFromStartsAt:session.rescheduledFromStartsAt?.toISOString()??null,rescheduledFromEndsAt:session.rescheduledFromEndsAt?.toISOString()??null,rescheduledAt:session.rescheduledAt?.toISOString()??null,isFixed:session.scheduleType==="FIXED",isBiweekly:session.scheduleFrequency==="BIWEEKLY",bookings:session.bookings.map(booking=>({id:booking.id,customerId:booking.customerId,customerName:booking.customerName,status:booking.status,bookingKind:booking.bookingKind,checkedInAt:booking.checkedInAt?.toISOString()??null}))})) };
    });

    kickCoachNotifications(storeId);if(!musicStore){revalidatePath("/dashboard/courses");revalidatePath("/dashboard");}
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
      if (data.kind === "room" && !data.isActive && !await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"}})) await assertNoCourseResourceUse(tx,storeId,{roomId:data.id});
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
    kickCoachNotifications(storeId);revalidatePath("/dashboard/courses");
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
    const [conflicts, room, targetTemplate] = await Promise.all([
      coursePrisma.courseSession.findMany({
        where: {
          storeId,
          cancelledAt: null,
          releasedAt: null,
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
      coursePrisma.courseTemplate.findFirst({ where: { id: d.templateId, storeId }, select: { musicScheduleMode: true, musicSubjectId:true } }),
    ]);
    const originals = dates.length > 1 || targetTemplate?.musicScheduleMode === "FIXED"
      ? await coursePrisma.courseSession.findMany({ where: {
          storeId, cancelledAt: null,
          OR: [
            { releasedAt: { not: null }, startsAt: { lt: dates[dates.length - 1].endsAt }, endsAt: { gt: dates[0].startsAt }, OR: [{ roomId: d.roomId }, { coachId: d.coachId }] },
            { rescheduledFromStartsAt: { lt: dates[dates.length - 1].endsAt }, rescheduledFromEndsAt: { gt: dates[0].startsAt }, OR: [{ rescheduledFromRoomId: d.roomId }, { rescheduledFromCoachId: d.coachId }] },
          ],
        }, select: { nameSnapshot: true, requestKey: true, releasedAt: true, startsAt: true, endsAt: true, roomId: true, coachId: true, rescheduledFromStartsAt: true, rescheduledFromEndsAt: true, rescheduledFromRoomId: true, rescheduledFromCoachId: true, template: { select: { musicScheduleMode: true } } } }) : [];
    const recurringKeys = originals.length ? new Set((await coursePrisma.courseSession.groupBy({ by: ["requestKey"], where: { storeId, cancelledAt: null, requestKey: { in: [...new Set(originals.map((item) => item.requestKey))] } }, _count: { id: true }, having: { id: { _count: { gt: 1 } } } })).map((row) => row.requestKey)) : new Set<string>();
    const fixedOriginals = originals.filter((item) => item.template.musicScheduleMode === "FIXED" || recurringKeys.has(item.requestKey));
    const allConflicts = [...conflicts, ...fixedOriginals.map((item) => ({
      startsAt: item.releasedAt ? item.startsAt : item.rescheduledFromStartsAt!,
      endsAt: item.releasedAt ? item.endsAt : item.rescheduledFromEndsAt!,
      roomId: item.releasedAt ? item.roomId : item.rescheduledFromRoomId!,
      coachId: item.releasedAt ? item.coachId : item.rescheduledFromCoachId!,
      nameSnapshot: `${item.nameSnapshot}（原固定課保留；僅可排單次）`,
    }))];
    return {
      success: true as const,
      data: {
        dates: dates.map((r) => ({
          startsAt: r.startsAt.toISOString(),
          conflict: allConflicts.some(
            (c) => c.startsAt < r.endsAt && c.endsAt > r.startsAt,
          ),
          conflicts: allConflicts.filter(c => c.startsAt < r.endsAt && c.endsAt > r.startsAt).map(c => ({
            name: c.nameSnapshot,
            startsAt: c.startsAt.toISOString(),
            endsAt: c.endsAt.toISOString(),
            resource: [c.roomId === d.roomId ? "教室" : "", c.coachId === d.coachId ? "授課人員" : ""].filter(Boolean).join("及"),
          })),
        })),
        capacityWarning:
          !targetTemplate?.musicSubjectId && room?.capacity && d.capacity > room.capacity
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
    const { user, storeId } = await writableStore("booking.update");
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
    const capacityIncreasedSessionIds = await courseTransaction(storeId, async (tx) => {
      const source = await tx.courseSession.findFirst({
        where: { id: d.id, storeId, cancelledAt: null },
      });
      if (!source) throw new AppError("NOT_FOUND", "找不到本店課程");
      const [room, coaches, sessions, seriesRule] = await Promise.all([
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
        tx.courseScheduleSeries.findUnique({ where: { storeId_requestKey: { storeId, requestKey: source.requestKey } } }),
      ]);
      if (!room || !coaches.length)
        throw new AppError("VALIDATION", "請選擇本店啟用的教室與授課人員");
      const shift = range.startsAt.getTime() - source.startsAt.getTime();
      const changes = sessions.map((s) => ({
        session: s,
        startsAt: new Date(s.startsAt.getTime() + shift),
        endsAt: new Date(
          s.startsAt.getTime() + shift + d.durationMinutes * 60000,
        ),
      }));
      if(d.templateId&&d.templateId!==source.templateId){const {ensureMusicTeachingItem}=await import("@/server/services/music-teaching-item");await ensureMusicTeachingItem(tx,storeId,d.templateId);}
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
            releasedAt: null,
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
      if (seriesRule) {
        const dateStart = new Date(`${toLocalDateStr(changes[0].startsAt)}T00:00:00.000Z`);
        const otherRules = await tx.courseScheduleSeries.findMany({
          where: { storeId, id: { not: seriesRule.id }, cancelledAt: null,
            startsAt: { lt: changes[changes.length - 1].endsAt },
            OR: [{ untilDate: null }, { untilDate: { gte: dateStart } }],
          },
        });
        const conflict = findFixedSeriesConflicts(otherRules, changes, { roomId: d.roomId, coachId: d.coachId })[0];
        if (conflict) throw new AppError("CONFLICT", `${conflict.date} · ${conflict.reason}，整批尚未修改`);
      }
      await assertCourseSessionsFitHours(tx,storeId,changes);
      await assertMusicCourseAvailability(tx,storeId,d.coachId,changes.filter(change=>change.session.coachId!==d.coachId||+change.session.startsAt!==+change.startsAt||+change.session.endsAt!==+change.endsAt));
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
      if (seriesRule) {
        await tx.courseScheduleSeries.update({
          where: { id: seriesRule.id },
          data: {
            templateId: d.templateId ?? seriesRule.templateId,
            nameSnapshot: d.nameSnapshot,
            startsAt: changes[0].startsAt,
            endsAt: new Date(changes[0].startsAt.getTime() + d.durationMinutes * 60000),
            roomId: d.roomId,
            coachId: d.coachId,
            pointCost: d.pointCost,
            capacity: d.capacity,
            generatedThrough: new Date(`${toLocalDateStr(changes[changes.length - 1].startsAt)}T00:00:00.000Z`),
            generationError: null,
          },
        });
      }
      return changes
        .filter(change => d.capacity > change.session.capacity)
        .map(change => change.session.id);
    });
    if (capacityIncreasedSessionIds.length)
      scheduleCapacityWaitlistPromotion(storeId, capacityIncreasedSessionIds, user);
    kickCoachNotifications(storeId);revalidatePath("/dashboard/courses");
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
    kickCoachNotifications(storeId);revalidatePath("/dashboard/courses");revalidatePath("/book");
    return {success:true as const};
  } catch(e){return handleCourseActionError(e);}
}
