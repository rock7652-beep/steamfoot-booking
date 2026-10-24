import { resolveSportsEntitlement, sportsEntitlementSnapshot, type SportsEntitlementFields } from "@/lib/sports-entitlement";
import {sportsNativePreview} from "@/lib/sports-native-preview";
import { isMusicCourseStore, readCourseBusinessProfile } from "./course-business-profile";
import { courseDebitPolicy, courseBookingWasDebited, correctedCourseBookingWillDebit } from "@/lib/course-debit-policy";
import { assertCourseSelfBookingEnabled, assertCourseSelfLeaveEnabled, assertCourseSelfRescheduleEnabled } from "./course-self-booking";
import { recordCourseStoreNotice } from "./course-store-notices";
import { bindMusicLesson } from "./music-lesson-periods";
import {courseCardStartIssue} from "@/lib/course-card-start";
import { syncNativeMakeupExpiry, nativeDeductedLeaveIds, isNativeMusicLeaveCard, nativeLeaveWasDebited, isNativeMusicMakeup, issueNativeMusicMakeup, closeNativeMusicMakeup } from "./music-native-leave";
import { courseCardMatchesItem } from "./music-item-compatibility";
import { courseCardCoversDate } from "@/lib/course-card-expiry";
import { isMusicOpeningMakeupBooking, MUSIC_OPENING_MAKEUP_OPERATION_ISSUE, MUSIC_OPENING_SELECT, readMusicOpeningCard, readMusicOpeningLesson, musicOpeningOperationIssue, musicOpeningDateIssue, type OpeningCard, type OpeningBooking } from "@/lib/music-opening-runtime";

import { enqueueOperationAudit } from "./operation-audit-outbox";
import { createHash } from "node:crypto";
import { resolveCustomerBookingWindow, type CustomerBookingWindowConfig } from "@/lib/shop-config";
import { getStoreLimitsByStoreId } from "@/lib/feature-gate";
import { courseMonthlyBookingWhere } from "@/lib/course-usage";
import { toLocalDateStr,dayRange } from "@/lib/date-utils";
import {musicCourseExpiry} from "@/lib/music-course-products";
import "server-only";
import {musicTeachingSubjectId} from "@/lib/music-teaching-item";
import {cardCoversTeachingItem} from "./music-teaching-item";
import { AppError } from "@/lib/errors";
import { courseTransaction } from "./course-access";
import { getCourseSharedCardStateInTransaction } from "./course-shared-card";
import type { Prisma } from "../../../generated/course-client";
import { isMusicPilotCard, isMusicPilotMakeupCard, issueMusicPilotLeaveMakeup, closeUnusedMusicPilotMakeup } from "./music-pilot-policy";

export type CourseActor = {
  storeId: string;
  userId: string;
  name: string;
  customerId?: string;
};

export type CourseNoShowChoice = "DEDUCTED" | "DEDUCTED_WITH_MAKEUP";
export async function syncCourseRelease(tx: Prisma.TransactionClient, storeId: string, sessionId: string) {
  const session = await tx.courseSession.findFirst({ where: { id: sessionId, storeId, cancelledAt: null }, select: { teacherAttendance: true, releasedAt: true, startsAt: true, endsAt: true, roomId: true, coachId: true } });
  if (!session) return;
  const sports = sportsNativePreview(storeId);
  const [active, leave] = await Promise.all([
    tx.courseBooking.count({ where: { storeId, sessionId, status: sports ? { notIn: ["CANCELLED", "NO_SHOW"] } : { not: "CANCELLED" } } }),
    tx.courseBooking.count({ where: { storeId, sessionId, OR: [{ status: "CANCELLED", absenceKind: { in: ["STUDENT_LEAVE", "GROUP_LEAVE_FORFEITED"] } }, ...(sports ? [{status: "NO_SHOW"}] : [])] } }),
  ]);
  const shouldRelease = active === 0 && (["LEAVE", "NO_SHOW"].includes(session.teacherAttendance) || leave > 0);
  if (shouldRelease !== Boolean(session.releasedAt)) {
    if (!shouldRelease) {
      const conflict = await tx.courseSession.findFirst({ where: {
        storeId, id: { not: sessionId }, cancelledAt: null, releasedAt: null,
        startsAt: { lt: session.endsAt }, endsAt: { gt: session.startsAt },
        OR: [{ roomId: session.roomId }, { coachId: session.coachId }],
      }, select: { roomId: true } });
      if (conflict) throw new AppError("CONFLICT", `原時段${conflict.roomId === session.roomId ? "教室" : "老師"}已有課，請先處理占用課程再恢復原課`);
    }
    // Reclaiming a slot checks the database's room and teacher exclusions.
    // A temporary class occupying it prevents accidental restoration.
    await tx.courseSession.update({ where: { id: sessionId }, data: { releasedAt: shouldRelease ? new Date() : null } });
  }
}
const COURSE_MAKEUP_VALID_DAYS = 7;
const fail = (message: string): never => {
  throw new AppError("VALIDATION", message);
};

/** Validate every imported binding before any attendance/balance mutation. */
function assertOpeningBooking(storeId: string, booking: OpeningBooking & { card?: OpeningCard | null }) {
  const opening = readMusicOpeningCard(booking.card, storeId, booking.customerId);
  const issue = musicOpeningOperationIssue(opening, booking.card ?? {});
  if (issue) return fail(issue);
  const lesson = readMusicOpeningLesson(opening, booking);
  if (lesson.kind === "BLOCKED") return fail(lesson.issue);
  const dateIssue = opening.kind === "NATIVE" ? null : musicOpeningDateIssue(opening, booking.session.startsAt);
  if (dateIssue) return fail(dateIssue);
  return opening;
}

export async function reserveCourse(
  actor: CourseActor,
  input: {
    sessionId: string;
    cardId?: string;
    autoCard?: boolean;
    customerId: string;
    requestKey: string;
    notes?: string;
    makeupForBookingId?: string | null;
    allowOverCapacity?: boolean;
  },
) {
  const limits = await getStoreLimitsByStoreId(actor.storeId);
  return courseTransaction(actor.storeId, async (tx) => {
    let cardId=input.cardId;
    if(input.autoCard){
      if(actor.customerId||!sportsNativePreview(actor.storeId))return fail("自動選卡僅適用運動店後台");
      const previous=await tx.courseBooking.findUnique({where:{storeId_requestKey:{storeId:actor.storeId,requestKey:input.requestKey}}});
      if(previous)cardId=previous.cardId??undefined;
      else {
        const session=await tx.courseSession.findFirst({where:{id:input.sessionId,storeId:actor.storeId,cancelledAt:null}});
        const {readSportsSessionRule}=await import("./sports-staging-schedule");
        const rule=await readSportsSessionRule(tx,actor.storeId,input.sessionId);
        if(!session||session.isTrial||!rule)return fail("請選擇有效的一般運動課程");
        const {findSportsCard}=await import("./sports-card-selection");
        const picked=await findSportsCard(tx,actor.storeId,input.customerId,[session],rule);
        if(!picked)return fail("學員沒有適用且足額的有效方案");
        cardId=picked.card.id;
      }
    }
    if(!cardId)return fail("請選擇有效方案");
    return reserveCourseInTransaction(
      tx,
      actor,
      {...input,cardId,onSite:true},
      limits.maxMonthlyBookings,
    );
  });
}

export async function reserveCourseMembers(
  actor: CourseActor,
  input: {
    sessionId: string;
    cardId: string;
    customerIds: string[];
    companionNames?: string[];
    requestKey: string;
    notes?: string;
    makeupForBookingId?: string | null;
    allowOverCapacity?: boolean;
  },
) {
  if (isMusicOpeningMakeupBooking(input as { bookingKind?: string; musicOpeningMakeupEntitlementId?: string | null }) || "musicOpeningMakeupEntitlementId" in input) return fail(MUSIC_OPENING_MAKEUP_OPERATION_ISSUE);
  const customers = [...new Set(input.customerIds)].sort();
  if (
    !customers.length ||
    customers.length !== input.customerIds.length ||
    customers.length > 20
  )
    return fail("請選擇 1 至 20 位不重複的上課人");
  const limits = await getStoreLimitsByStoreId(actor.storeId);
  const batchKey = createHash("sha256")
    .update(JSON.stringify(input.companionNames?.length ? [input.requestKey, customers, input.companionNames] : [input.requestKey, customers]))
    .digest("hex");
  return courseTransaction(actor.storeId, async (tx) => {
    const bookings = [];
    const companionNames = input.companionNames ?? [];
    if (companionNames.length && (!actor.customerId || customers.length !== 1 || customers[0] !== actor.customerId || companionNames.length > 2))
      return fail("同行預約須包含本人，最多 3 人");
    for (const customerId of customers) {
      bookings.push(
        await reserveCourseInTransaction(
          tx,
          actor,
          {
            sessionId: input.sessionId,
            cardId: input.cardId,
            customerId,
            requestKey: `${batchKey}:${customerId}`,
            notes: input.notes,
            groupKey: batchKey,
            reserverCustomerId: actor.customerId,
            reserverCardId: input.cardId,
            reserverName: actor.name,
          },
          limits.maxMonthlyBookings,
        ),
      );
    }
    for (const [index, name] of companionNames.entries()) {
      bookings.push(await reserveCourseInTransaction(tx, actor, {
        sessionId: input.sessionId, cardId: input.cardId, customerId: null,
        companionIndex: index + 1, customerName: name.trim() || `同行者 ${index + 1}`,
        reserverCustomerId: actor.customerId,
            reserverCardId: input.cardId, reserverName: actor.name, groupKey: batchKey,
        requestKey: `${batchKey}:companion:${index + 1}`, notes: input.notes,
      }, limits.maxMonthlyBookings));
    }
    return bookings;
  });
}

export async function reserveTrialCourse(actor: CourseActor, input: { sessionId: string; customerId: string|null; requestKey: string; notes?: string; allowOverCapacity?:boolean; trialPrice: number;customerName?:string }) {
  const limits = await getStoreLimitsByStoreId(actor.storeId);
  // This is a staff-only back-office action used to enter trial learners,
  // including after the session, when backfilling the roster.
  return courseTransaction(actor.storeId, tx => reserveCourseInTransaction(tx, actor, { ...input, cardId: null, onSite: true }, limits.maxMonthlyBookings));
}

export async function reserveCourseInTransaction(
  tx: Prisma.TransactionClient,
  actor: CourseActor,
  input: {
    musicRescheduleFromBookingId?: string;
    sessionId: string;
    cardId: string | null;
    trialPrice?: number;
    deferredPayment?: boolean;
    customerId: string | null;
    customerName?: string;
    companionIndex?: number;
    reserverCustomerId?: string;
    reserverName?: string;
    reserverCardId?: string;
    groupKey?: string;
    onSite?: boolean;
    requestKey: string;
    notes?: string;
    makeupForBookingId?: string | null;
    allowOverCapacity?: boolean;
  },
  maxMonthlyBookings: number | null,
  options: { existingWaitlistEntryId?: string; manualWaitlistPromotion?: boolean; memberReschedule?: boolean; sportsMemberTrial?: boolean } = {},
) {
  const { storeId } = actor;
  if (isMusicOpeningMakeupBooking(input as { bookingKind?: string; musicOpeningMakeupEntitlementId?: string | null }) || "musicOpeningMakeupEntitlementId" in input) return fail(MUSIC_OPENING_MAKEUP_OPERATION_ISSUE);
  const deferred = input.deferredPayment === true;
  if (deferred) {
    if (actor.customerId || input.cardId || !input.customerId || input.trialPrice !== undefined)
      return fail("待繳費排課僅限店家替已建檔學員安排");
    const music = await tx.$queryRaw<Array<{featureKey:string}>>`SELECT "featureKey" FROM "StoreFeatureEntitlement" WHERE "storeId"=${storeId} AND "featureKey"='business.music' AND status::text='ENABLED' LIMIT 1`;
    if (!music.length) return fail("待繳費排課僅適用音樂模組");
  }
  const previous = await tx.courseBooking.findUnique({
    where: { storeId_requestKey: { storeId, requestKey: input.requestKey } },
  });
  if (previous) {
    if (isMusicOpeningMakeupBooking(previous)) return fail(MUSIC_OPENING_MAKEUP_OPERATION_ISSUE);
    if (
      previous.operatorUserId !== actor.userId ||
      previous.sessionId !== input.sessionId ||
      previous.cardId !== input.cardId ||
      previous.customerId !== input.customerId ||
      (previous.companionIndex ?? null) !== (input.companionIndex ?? null) ||
      (input.companionIndex && previous.customerName !== input.customerName) ||
      (previous.makeupForBookingId ?? null) !== (input.makeupForBookingId ?? null) ||
      (input.cardId === null && (previous.trialPrice !== (input.trialPrice ?? null) || (deferred && previous.bookingKind !== "UNPAID"))) ||
      (!input.customerId && !input.companionIndex && previous.customerName!==input.customerName)
    )
      fail("預約請求已使用，請重新開啟表單");
    return previous;
  }
  if (maxMonthlyBookings !== null) {
    const used = await tx.courseBooking.count({
      where: courseMonthlyBookingWhere(storeId),
    });
    if (used >= maxMonthlyBookings)
      throw new AppError("FORBIDDEN", "已達方案本月預約額度上限");
  }
  const [session, card, rule, customers] = await Promise.all([
    tx.courseSession.findFirst({
      where: { id: input.sessionId, storeId, cancelledAt: null },
      include: { template: {select:{visibility:true,isActive:true,musicSubjectId:true,musicSubject:{select:{isActive:true}}}} },
    }),
    input.cardId ? tx.coursePointCard.findFirst({
      where: { id: input.cardId, storeId },
      include: { members: true, musicOpeningState: { select: MUSIC_OPENING_SELECT }, plan: { select: { allowShared: true } } },
    }) : Promise.resolve(null),
    tx.courseBookingRule.findUnique({ where: { storeId } }),
    input.customerId ? tx.$queryRaw<
      Array<{ id: string; name: string }>
    >`SELECT id, name FROM "Customer" WHERE id = ${input.customerId} AND "storeId" = ${storeId} AND "mergedIntoCustomerId" IS NULL` : Promise.resolve([]),
  ]);
  // Only a matching persisted queue entry can retain its existing rights.
  // Manual self-booking overrides cannot authorize a different member or course.
  const existingWaitlistEntry = options.existingWaitlistEntryId &&
      input.requestKey === `waitlist-promote:${options.existingWaitlistEntryId}`
      ? await tx.courseWaitlistEntry.findFirst({
        where: {
          id: options.existingWaitlistEntryId, storeId, status: "WAITING",
          sessionId: input.sessionId, cardId: input.cardId ?? "", customerId: input.customerId,
          customerName: input.customerName ?? "", companionIndex: input.companionIndex ?? null,
          reserverCustomerId: input.reserverCustomerId ?? null,
          reserverCardId: input.reserverCardId ?? null, reserverName: input.reserverName ?? null,
          groupKey: input.groupKey ?? "", operatorUserId: actor.userId,
          operatorCustomerId: actor.customerId ?? null, operatorName: actor.name,
        },
        select: { id: true },
      }) : null;
  if (options.existingWaitlistEntryId && !existingWaitlistEntry)
    return fail("原同行候補紀錄已變更，請重新確認");
  if (options.manualWaitlistPromotion && !existingWaitlistEntry)
    return fail("人工遞補必須對應原候補紀錄");
  // The manual option comes only from the permission-checked staff action and
  // requires the exact persisted queue entry. Other member rules still apply.
  if (actor.customerId && !options.manualWaitlistPromotion) {
    if(options.memberReschedule)assertCourseSelfRescheduleEnabled(rule);
    else assertCourseSelfBookingEnabled(rule);
  }
  let entitlementCost: number | null = null;
  {
    const {readSportsSessionRule}=await import('./sports-staging-schedule');
    const rule=await readSportsSessionRule(tx,storeId,input.sessionId);
    if(input.companionIndex&&rule?.enrollment==='ASSIGNED')return fail('指定學員課程不使用同行預約');
    if(actor.customerId&&rule?.enrollment==='ASSIGNED')return fail('本堂僅限店家指定學員，不開放自行選課');
    if (card && session && !(await isMusicCourseStore(tx,storeId))) {
      const rights = resolveSportsEntitlement(
        { ...card, templateRestricted: card.requestKey?.startsWith("no-show-makeup:") ?? false },
        { templateId: session.templateId, subjectId: session.template.musicSubjectId ?? null,
          pointCost: session.pointCost, enrollment: rule?.enrollment === "ASSIGNED" ? "ASSIGNED" : rule?.enrollment === "OPEN" ? "OPEN" : null,
          legacyPlanId: rule?.planId ?? null },
      );
      if (!rights.eligible) return fail(rights.reason);
      entitlementCost = rights.cost;
    }
    if(rule&&session?.isTrial&&card)return fail('體驗課請使用體驗預約，不扣一般方案');
    if(options.sportsMemberTrial&&(!actor.customerId||actor.customerId!==input.customerId||!session?.isTrial||rule?.enrollment!=='OPEN'||rule.planId!==null))return fail('此課未開放體驗預約');
  }
  if (session && ["LEAVE", "NO_SHOW"].includes(session.teacherAttendance)) return fail("教師未授課，無法預約本堂");
  const unidentifiedTrial=input.cardId===null&&!input.customerId&&!input.companionIndex&&!!input.customerName?.trim()&&input.customerName.length<=80&&!actor.customerId;
  if (!session || (input.cardId !== null && !card) || (!input.companionIndex && !customers.length && !unidentifiedTrial))
    return fail("請選擇本店有效課程、方案與上課人");
  if (actor.customerId && !options.manualWaitlistPromotion && session.bookingAudience === "ASSIGNED") return fail("此堂為指定學員課程，請由店家安排");
  if (session.releasedAt) return fail("此課原時段已釋出，請先處理現有排課再恢復預約");
  if (!session.template.isActive || session.template.musicSubject?.isActive===false || session.template.visibility === "OFF" || (actor.customerId && session.template.visibility !== "PUBLIC")) return fail("本課程目前不開放新增預約，既有預約仍可查閱與依規則取消");
  if (actor.customerId && session.enrollmentMode === "ASSIGNED" && !options.memberReschedule) return fail("本堂為指定學員，不開放報名");
  if (card && (
    (!input.companionIndex && !card.members.some((m) => m.customerId === input.customerId)) ||
    (actor.customerId &&
      !card.members.some((m) => m.customerId === actor.customerId))
  ))
    return fail("僅能替此共卡的授權成員預約");
  const opening = readMusicOpeningCard(card, storeId, input.customerId);
  const openingIssue = musicOpeningOperationIssue(opening, card ?? {});
  if (openingIssue) return fail(openingIssue);
  let openingSlot: { sourceLessonKey: string; sourceTermKey: string; originalLessonOrdinal: number } | undefined;
  if (opening.kind === "OPENING") {
    if (actor.customerId || !await isMusicPilotCard(tx,storeId,card) || input.companionIndex || input.makeupForBookingId) return fail("期初方案新增或重排須先連結來源堂次，目前入口尚未開放");
    const used=await tx.courseBooking.findMany({where:{storeId,cardId:card!.id,OR:[{status:{not:"CANCELLED"}},{absenceKind:{in:["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"]}}]},select:{musicOpeningSourceLessonKey:true}});
    openingSlot=opening.record.ordinarySourceSlots?.find(s=>!used.some(b=>b.musicOpeningSourceLessonKey===s.sourceLessonKey));
    if(!openingSlot)return fail("原方案沒有尚未使用的普通堂次");
    const dateIssue=musicOpeningDateIssue(opening,session.startsAt);if(dateIssue)return fail(dateIssue);
  }
  if ("musicOpeningTermKey" in input || "musicOpeningLessonOrdinal" in input || "musicOpeningSourceLessonKey" in input)
    return fail("一般預約入口不接受來源期初堂次");
  await isMusicPilotMakeupCard(tx,storeId,card,session.startsAt);
  await isNativeMusicMakeup(tx,storeId,card,session.startsAt);
  if (input.companionIndex) {
    const music = await isMusicCourseStore(tx, storeId);
    if (music || !card || card.termSessionIds.length || (!existingWaitlistEntry && !card.plan.allowShared) || !input.reserverCustomerId || !card.members.some(m => m.customerId === input.reserverCustomerId))
      return fail("此方案未開放自由選課同行預約");
    if (!existingWaitlistEntry && await getCourseSharedCardStateInTransaction(tx, storeId) !== "ENABLED")
      return fail("本店共卡功能尚未開通，不能新增同行預約");
    if (input.customerId || !Number.isInteger(input.companionIndex) || input.companionIndex < 1 || input.companionIndex > 2 || !input.customerName || input.customerName.length > 100 || (actor.customerId && actor.customerId !== input.reserverCustomerId))
      return fail("同行預約資料不正確");
  }
  if (card && card.unit !== "SESSION") {
    const music = await isMusicCourseStore(tx, storeId);
    if(music)return fail("音樂教室只使用堂數方案，不能以點數預約");
  }
  if(card?.termSessionIds?.length&&!card.termSessionIds.includes(session.id))return fail("期課方案僅能使用指定課次");
  if (card?.closedAt) return fail("此方案已退款或結清，不能預約");
  if (await isMusicCourseStore(tx,storeId) && card?.templateIds?.length && !(musicTeachingSubjectId(session.templateId) ? await cardCoversTeachingItem(tx,storeId,session.templateId,card.templateIds) : await courseCardMatchesItem(tx, storeId, card.templateIds, session.templateId))) return fail("此方案不適用本堂課");
  if(card?.musicJoinSessionId) {
    const first=await tx.courseSession.findFirst({where:{id:card.musicJoinSessionId,storeId},select:{startsAt:true}});
    const startIssue=courseCardStartIssue(true,first?.startsAt,session.startsAt);
    if(startIssue)return fail(startIssue);
  }
  if (input.makeupForBookingId) {
    if (actor.customerId || !card || card.unit !== "SESSION") return fail("補課僅由店長使用原堂數方案安排");
    const music = await isMusicCourseStore(tx, storeId);
    const source = await tx.courseBooking.findFirst({where:{id:input.makeupForBookingId,storeId,customerId:input.customerId,cardId:card.id,status:"CANCELLED",absenceKind:"STUDENT_LEAVE"},include:{session:{include:{template:true}}}});
    if (source && isMusicOpeningMakeupBooking(source)) return fail(MUSIC_OPENING_MAKEUP_OPERATION_ISSUE);
    if (!music || !source || source.session.template.classType === "GROUP" || source.session.templateId !== session.templateId || source.session.startsAt >= session.startsAt) return fail("請選擇此學員同課程、原方案的待補課紀錄");
    if (await tx.courseBooking.findFirst({where:{storeId,makeupForBookingId:source.id,OR:[{status:{not:"CANCELLED"}},{absenceKind:"STUDENT_LEAVE"}]}})) return fail("這次請假已安排補課，請重新選擇");
  }
  const bookingCost = card ? (entitlementCost ?? (card.unit === "SESSION" ? 1 : session.pointCost)) : 0;
  if (!card && !deferred && (!Number.isSafeInteger(input.trialPrice) || input.trialPrice! < 0 || input.trialPrice! > 1000000 || (actor.customerId&&!options.sportsMemberTrial))) return fail("體驗預約僅由有權限店長建立");
  const now = new Date();
  if (
    !(input.onSite && !actor.customerId) &&
    session.startsAt.getTime() <=
    now.getTime() + (rule?.bookingLeadMinutes ?? 0) * 60000
  )
    return fail("已超過預約截止時間");
  if (actor.customerId) {
    const configs = await tx.$queryRaw<CustomerBookingWindowConfig[]>`SELECT "bookableUntilDate", "bookingOpensAt", "bookingWindowDays" FROM "ShopConfig" WHERE "storeId"=${storeId}`;
    const window = resolveCustomerBookingWindow(configs[0], now);
    if ((window.opensAt && now < window.opensAt) || session.startsAt > window.closesAt) return fail("此課程尚未開放會員預約，請依店家開放期限預約");
  }
  const sessionDay = toLocalDateStr(session.startsAt);
  const closed = await tx.$queryRaw<Array<{closed:boolean}>>`SELECT COALESCE((SELECT type <> 'custom' FROM "SpecialBusinessDay" WHERE "storeId"=${storeId} AND date=${new Date(sessionDay+'T00:00:00Z')}::date), (SELECT NOT "isOpen" FROM "BusinessHours" WHERE "storeId"=${storeId} AND "dayOfWeek"=EXTRACT(DOW FROM ${new Date(sessionDay+'T00:00:00Z')}::date)::int), false) AS closed`;
  if (closed[0]?.closed) return fail("店家公休日無法新增預約");
  if (card && (!courseCardCoversDate(card, storeId, now) || !courseCardCoversDate(card, storeId, session.startsAt)))
    return fail("方案已到期或不涵蓋上課日期");
  if(card?.musicValidityDays && !card.musicActivatedAt) {
    const [earliest,latest]=await Promise.all([
      tx.courseBooking.findFirst({where:{storeId,cardId:card.id,status:"RESERVED"},orderBy:{session:{startsAt:"asc"}},select:{session:{select:{startsAt:true}}}}),
      tx.courseBooking.findFirst({where:{storeId,cardId:card.id,status:"RESERVED"},orderBy:{session:{startsAt:"desc"}},select:{session:{select:{startsAt:true}}}}),
    ]);
    const first=earliest?.session.startsAt && earliest.session.startsAt<session.startsAt ? earliest.session.startsAt : session.startsAt;
    const last=latest?.session.startsAt && latest.session.startsAt>session.startsAt ? latest.session.startsAt : session.startsAt;
    if(last>musicCourseExpiry(first,card.musicValidityDays))return fail("預約超過首次上課起算的方案效期，請調整日期");
  }
  const [duplicate, occupied, held] = await Promise.all([
    input.customerId ? tx.courseBooking.findFirst({
      where: {
        storeId,
        sessionId: session.id,
        customerId: input.customerId,
        status: { not: "CANCELLED" },
      },
    }) : Promise.resolve(null),
    tx.courseBooking.count({
      where: { storeId, sessionId: session.id, status: { not: "CANCELLED" } },
    }),
    card ? tx.courseBooking.aggregate({
      where: { storeId, cardId: card.id, status: "RESERVED" },
      _sum: { pointCost: true },
    }) : Promise.resolve({_sum:{pointCost:0}}),
  ]);
  if (duplicate) return fail("此上課人已預約本堂課");
  if (occupied >= session.capacity && !(input.allowOverCapacity && !actor.customerId)) return fail("本堂課已滿班，請由店長確認加人");
  if (input.customerId) {
    const overlap = await tx.courseBooking.findFirst({where:{storeId,customerId:input.customerId,status:{not:"CANCELLED"},session:{cancelledAt:null,releasedAt:null,startsAt:{lt:session.endsAt},endsAt:{gt:session.startsAt}}},select:{id:true}});
    if(overlap) return fail("學員同時段已有課程，請先調整上課時間");
  }
  if (card && card.remaining - (held._sum.pointCost ?? 0) < bookingCost)
    return fail(card.unit === "SESSION" ? "方案可用堂數不足" : "方案可用點數不足");
  const booking = await tx.courseBooking.create({
    data: {
      sessionId:input.sessionId,cardId:input.cardId,customerId:input.customerId,requestKey:input.requestKey,
      notes:input.notes,makeupForBookingId:input.makeupForBookingId,trialPrice:input.trialPrice,
      bookingKind: card ? "CARD" : deferred ? "UNPAID" : "TRIAL",
      storeId,
      pointCost: bookingCost,
      operatorUserId: actor.userId,
      operatorCustomerId: actor.customerId ?? null,
      operatorName: actor.name,
      customerName: input.companionIndex || unidentifiedTrial ? input.customerName! : customers[0].name,
      companionIndex: input.companionIndex,
      reserverCustomerId: input.reserverCustomerId,
      reserverName: input.reserverName,
      reserverCardId: input.reserverCardId,
      groupKey: input.groupKey,
      ...(openingSlot ? {musicOpeningSourceLessonKey:openingSlot.sourceLessonKey,musicOpeningTermKey:openingSlot.sourceTermKey,musicOpeningLessonOrdinal:openingSlot.originalLessonOrdinal}:{}),
    },
  });
  await bindMusicLesson(tx, storeId, booking, card, input.musicRescheduleFromBookingId);
  if (card) await tx.coursePointEntry.create({
    data: {
      storeId,
      cardId: card.id,
      bookingId: booking.id,
      kind: "RESERVE",
      points: booking.pointCost,
      actorUserId: actor.userId,
    },
  });
  if(actor.customerId)await recordCourseStoreNotice(tx,actor,{subjectKey:`booking:${booking.id}`,kind:"BOOKING",customerName:booking.customerName,courseName:session.nameSnapshot,coachId:session.coachId,startsAt:session.startsAt});
  await enqueueOperationAudit({ actorUserId: actor.userId, actorNameSnapshot: actor.name, storeId, module: "COURSE", targetType: "CourseBooking", targetId: booking.id, action: "CREATE", summary: "建立課程預約" }, tx, input.requestKey);
  if(!options.memberReschedule && actor.customerId)await recordCourseStoreNotice(tx,actor,{subjectKey:`booking:${booking.id}`,kind:"BOOKING",customerName:booking.customerName,courseName:session.nameSnapshot,coachId:session.coachId,startsAt:session.startsAt});
  return booking;
}

export async function settleCourseBooking(
  tx: Prisma.TransactionClient,
  actor: CourseActor,
  bookingId: string,
  target: "CANCELLED" | "ATTENDED" | "CHECKED_IN" | "NO_SHOW" | "STUDENT_LEAVE",
  noShowChoice: CourseNoShowChoice = "DEDUCTED",
  options: { memberReschedule?: boolean; suppressNotice?: boolean } = {},
) {
  let booking = await tx.courseBooking.findFirst({
    where: { id: bookingId, storeId: actor.storeId },
    include: { session: true, card: { include: { members: true, musicOpeningState: { select: MUSIC_OPENING_SELECT } } } },
  });
  if (!booking) return fail("找不到本店預約");
  const opening = assertOpeningBooking(actor.storeId, booking);
  if(sportsNativePreview(actor.storeId)&&booking.bookingKind==="UNPAID"&&(target==="ATTENDED"||target==="NO_SHOW")&&(booking.requestKey.startsWith("sports-fixed:")||booking.requestKey.startsWith("sports-makeup:"))){
    const {bindSportsAttendanceCard}=await import("./sports-permanent-series");
    await bindSportsAttendanceCard(tx,actor,bookingId);
    booking=await tx.courseBooking.findFirst({where:{id:bookingId,storeId:actor.storeId},include:{session:true,card:{include:{members:true,musicOpeningState:{select:MUSIC_OPENING_SELECT}}}}});
    if(!booking?.cardId) return fail("學員尚未有可扣抵方案");
  }

  if(sportsNativePreview(actor.storeId)&&booking.requestKey?.startsWith("sports-fixed:")&&target==="NO_SHOW")noShowChoice="DEDUCTED_WITH_MAKEUP";
  // A member's cancellation cannot choose a different music debit policy.
  // Rescheduling transfers the reservation atomically and is not a leave.
  if (actor.customerId && booking.cardId && target === "CANCELLED" && !options.memberReschedule &&
      await isMusicCourseStore(tx, actor.storeId)) target = "STUDENT_LEAVE";
  if (["LEAVE", "NO_SHOW"].includes(booking.session.teacherAttendance) && target !== "CANCELLED") return fail("教師未授課，本堂免點名；請先恢復授課");
  if (target === "NO_SHOW" && noShowChoice === "DEDUCTED_WITH_MAKEUP") {
    const music = await isMusicCourseStore(tx, actor.storeId);
    if (!courseDebitPolicy(music ? "MUSIC" : "FITNESS", { target, hasCard: !!booking.cardId }).allowsNoShowMakeup)
      return fail("音樂教室曠課只扣堂，不發補課券");
  }
  if (
    actor.customerId &&
    !(booking.reserverCustomerId === actor.customerId || (booking.card ? booking.card.members.some((m) => m.customerId === actor.customerId) : booking.customerId === actor.customerId))
  )
    return fail("無權操作此共卡預約");
  if (booking.status === target) return booking;
  if (target === "STUDENT_LEAVE" && booking.status === "CANCELLED" && ["STUDENT_LEAVE", "GROUP_LEAVE_FORFEITED"].includes(booking.absenceKind ?? "")) return booking;
  if (booking.status !== "RESERVED")
    return fail("此預約已結算或取消，不能重複操作");
  if(actor.customerId && (target==="CANCELLED"||target==="STUDENT_LEAVE")){
    const rule=await tx.courseBookingRule.findUnique({where:{storeId:actor.storeId}});
    if(options.memberReschedule)assertCourseSelfRescheduleEnabled(rule);else assertCourseSelfLeaveEnabled(rule);
    if(booking.session.startsAt.getTime()<=Date.now()+(rule?.cancellationLeadMinutes??0)*60000)return fail("已超過取消截止時間，請聯絡店家");
  }
  if (target === "CHECKED_IN" || target === "NO_SHOW") {
    if (actor.customerId) return fail("點名僅限有權限的人員");
    if (target === "CHECKED_IN") {
      if (booking.checkedInAt) return booking;
      if (booking.bookingKind === "TRIAL") await auditTrialAttendance(tx, actor, booking.id, booking.status, "CHECKED_IN");
      return tx.courseBooking.update({
        where: { id: booking.id },
        data: { checkedInAt: new Date() },
      });
    }
  }
  const profile = target === "STUDENT_LEAVE" && booking.cardId ? await readCourseBusinessProfile(tx,actor.storeId) : "FITNESS";
  const classType = profile === "MUSIC" ? (await tx.courseTemplate.findFirst({where:{storeId:actor.storeId,...(musicTeachingSubjectId(booking.session.templateId)&&booking.card?.templateIds.length?{id:{in:booking.card.templateIds},musicSubjectId:musicTeachingSubjectId(booking.session.templateId)}:{id:booking.session.templateId})},select:{classType:true}}))?.classType : null;
  const nativeLeave = target === "STUDENT_LEAVE" && await isNativeMusicLeaveCard(tx,actor.storeId,booking.card);
  const nativeMakeupLeave = target === "STUDENT_LEAVE" && await isNativeMusicMakeup(tx,actor.storeId,booking.card);
  const pilotLeave = target === "STUDENT_LEAVE" && await isMusicPilotCard(tx,actor.storeId,booking.card);
  const pilotMakeupLeave = target === "STUDENT_LEAVE" && await isMusicPilotMakeupCard(tx,actor.storeId,booking.card);
  const policy=courseDebitPolicy(profile,{target,hasCard:!!booking.cardId,classType});
  const musicGroupLeave=policy.groupLeaveForfeited&&!nativeLeave&&!pilotLeave&&!pilotMakeupLeave&&!nativeMakeupLeave;
  const shouldDebit=(policy.shouldDebit&&!policy.groupLeaveForfeited)||musicGroupLeave||pilotLeave||nativeLeave;
  if (shouldDebit) {
    // Authorized member group leave forfeits a lesson; it is not staff attendance.
    // Membership, the self-leave switch and the cutoff were checked above.
    if (actor.customerId && !musicGroupLeave) return fail("點名僅限有權限的人員");
    if (booking.cardId) {
    const expiry=opening.kind === "NATIVE" && booking.card?.musicValidityDays && !booking.card.musicActivatedAt ? musicCourseExpiry(booking.session.startsAt,booking.card.musicValidityDays) : null;
    if(booking.card?.musicValidityDays && booking.card.musicActivatedAt && !courseCardCoversDate(booking.card, actor.storeId, booking.session.startsAt))
      return fail("這堂課超過方案有效期限，請核對補課日期");
    const updated = await tx.coursePointCard.updateMany({
      where: {
        id: booking.cardId,
        storeId: actor.storeId,
        remaining: { gte: booking.pointCost },
      },
      data: { remaining: { decrement: booking.pointCost }, ...(expiry ? {expiresAt:expiry,musicActivatedAt:booking.session.startsAt}: {}) },
    });
    if (!updated.count) return fail("方案額度異常，尚未完成點名");
    }
  }
  const updated = await tx.courseBooking.update({
    where: { id: booking.id },
    data: { status: target === "STUDENT_LEAVE" ? "CANCELLED" : target, absenceKind: target === "STUDENT_LEAVE" ? (musicGroupLeave ? "GROUP_LEAVE_FORFEITED" : "STUDENT_LEAVE") : null },
  });
  if(!options.suppressNotice && (target === "STUDENT_LEAVE" || target === "CANCELLED"))await recordCourseStoreNotice(tx,actor,{subjectKey:`booking:${booking.id}`,kind:target==="STUDENT_LEAVE"?"LEAVE":"CANCEL",customerName:booking.customerName,courseName:booking.session.nameSnapshot,coachId:booking.session.coachId,startsAt:booking.session.startsAt,details:{absenceKind:target==="STUDENT_LEAVE"?(musicGroupLeave?"GROUP_LEAVE_FORFEITED":"STUDENT_LEAVE"):null}});
  if(pilotLeave)await issueMusicPilotLeaveMakeup(tx,actor,booking);
  if(nativeLeave)await issueNativeMusicMakeup(tx,actor,booking);
  if (sportsNativePreview(actor.storeId) || target === "STUDENT_LEAVE" || target === "CANCELLED") await syncCourseRelease(tx, actor.storeId, booking.sessionId);
  if (!booking.cardId && booking.bookingKind === "TRIAL" && target === "ATTENDED") {
    await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","storeId",module,summary,"targetType","targetId",action,"createdAt") VALUES (${`course-trial-care-completed:${actor.storeId}:${booking.id}`},${actor.userId},${actor.storeId},'COURSE','完成體驗課程，供啟用後關懷判斷','CourseBooking',${booking.id},'COURSE_TRIAL_CARE_COMPLETED',NOW()) ON CONFLICT (id) DO NOTHING`;
  }
  if (!booking.cardId) { if (booking.bookingKind === "TRIAL") await auditTrialAttendance(tx,actor,booking.id,booking.status,target); return updated; }
  const kind = shouldDebit ? "DEBIT" : "RELEASE";
  const previousEntry = await tx.coursePointEntry.findUnique({where:{bookingId_kind:{bookingId:booking.id,kind}}});
  await tx.coursePointEntry.create({
    data: {
      storeId: actor.storeId,
      cardId: booking.cardId,
      bookingId: booking.id,
      kind: previousEntry ? `${kind}:${crypto.randomUUID()}` : kind,
      points: booking.pointCost,
      actorUserId: actor.userId,
    },
  });
  if (
    target === "NO_SHOW" &&
    noShowChoice === "DEDUCTED_WITH_MAKEUP" &&
    !booking.card?.termSessionIds?.length &&
    booking.card
  ) {
    await grantCourseNoShowMakeup(tx, actor, booking);
  }
  return updated;
}

// Called under the store transaction lock by initial settlement and correction.
async function grantCourseNoShowMakeup(
  tx: Prisma.TransactionClient, actor: CourseActor,
  booking: {id:string;requestKey:string;pointCost:number;customerId:string|null;reserverCustomerId:string|null;session:{templateId:string};card:({planId:string;unit:string} & SportsEntitlementFields)|null},
) {
  if (!booking.card) return;
  const sportsFixed=sportsNativePreview(actor.storeId)&&(booking.requestKey?.startsWith("sports-fixed:")??false);
  const expiresAt = sportsFixed?dayRange("2099-12-31").end:new Date();
  if(!sportsFixed)expiresAt.setDate(expiresAt.getDate() + COURSE_MAKEUP_VALID_DAYS);
  const recalled = sportsNativePreview(actor.storeId) ? await tx.coursePointCard.findUnique({where:{storeId_requestKey:{storeId:actor.storeId,requestKey:`no-show-makeup:${booking.id}`}}}) : null;
  if(recalled && (!recalled.closedAt || recalled.remaining!==0))return fail("原缺課補課資格尚未完成撤銷，請先核對");
  const makeupCard = recalled ? await tx.coursePointCard.update({where:{id:recalled.id},data:{closedAt:null,remaining:booking.pointCost,expiresAt}}) : await tx.coursePointCard.create({
    data: {
      storeId: actor.storeId,
      planId: booking.card.planId,
      ...sportsEntitlementSnapshot({ ...booking.card, ...(booking.card.sportsMode === "ASSIGNED" ? { sportsCost: booking.pointCost } : {}) }),
      nameSnapshot: sportsFixed?"固定課待補課":`補課券（${COURSE_MAKEUP_VALID_DAYS}日）`,
      unit: booking.card.unit,
      templateIds: [booking.session.templateId],
      termSessionIds: [],
      remaining: booking.pointCost,
      expiresAt,
      requestKey: `no-show-makeup:${booking.id}`,
    },
  });
  if(!recalled)await tx.courseCardMember.create({
    data: {
      storeId: actor.storeId,
      cardId: makeupCard.id,
      customerId: booking.customerId ?? booking.reserverCustomerId!,
    },
  });
  await tx.coursePointEntry.create({
    data: {
      storeId: actor.storeId,
      cardId: makeupCard.id,
      kind: "GRANT",
      points: booking.pointCost,
      actorUserId: actor.userId,
    },
  });
}

// Caller must hold the course store lock and independently authorize the coach.
export async function correctCourseAttendance(
  tx: Prisma.TransactionClient, actor: CourseActor, bookingId: string,
  target: "RESERVED" | "ATTENDED" | "NO_SHOW" | "CANCELLED", expectedStatus: string,
  options:{suppressNotice?:boolean;waiveAbsence?:boolean}={},
) {
  if(options.waiveAbsence && target!=="CANCELLED") return fail("免扣堂更正目標不正確");
  const absenceKind=options.waiveAbsence ? "STUDENT_LEAVE" as const : null;
  const b = await tx.courseBooking.findFirst({ where: { id: bookingId, storeId: actor.storeId }, include: { session: true, card: { include: { members: true, musicOpeningState: { select: MUSIC_OPENING_SELECT } } } } });
  const nativeLeave = b?.absenceKind === "STUDENT_LEAVE" && await nativeLeaveWasDebited(tx,actor.storeId,b.id);
  const pilotLeave = b?.absenceKind === "STUDENT_LEAVE" && await isMusicPilotCard(tx,actor.storeId,b.card);
  if(sportsNativePreview(actor.storeId)&&b?.status==="RESERVED"&&b.status===expectedStatus&&(target==="ATTENDED"||target==="NO_SHOW")&&b.requestKey?.startsWith("sports-fixed:"))return settleCourseBooking(tx,actor,bookingId,target);
  const restoringLeave = b?.status === "CANCELLED" && ["STUDENT_LEAVE", "GROUP_LEAVE_FORFEITED", "TEACHER_ABSENT"].includes(b.absenceKind ?? "") && target === "RESERVED" && expectedStatus === "CANCELLED";
  const cancellingLeave = target === "CANCELLED" && b?.status === "CANCELLED" && ["STUDENT_LEAVE", "GROUP_LEAVE_FORFEITED"].includes(b.absenceKind ?? "");
  if (!b || (b.status === "CANCELLED" && !restoringLeave && !cancellingLeave) || b.session.cancelledAt) return fail("此預約無法更正");
  const opening = assertOpeningBooking(actor.storeId, b);
  if (["LEAVE", "NO_SHOW"].includes(b.session.teacherAttendance)) return fail("教師未授課，本堂免點名；請先恢復授課");
  if (b.status === target && !cancellingLeave) return b;
  if (b.card?.closedAt) return fail("此方案已退款或結清，無法更正出席額度");
  if (b.status !== expectedStatus) return fail("另一位人員已更新點名，請重新確認");
  if(pilotLeave)await closeUnusedMusicPilotMakeup(tx,actor.storeId,b.id);
  if(nativeLeave)await closeNativeMusicMakeup(tx,actor.storeId,b.id);
  if ((target === "CANCELLED" || sportsNativePreview(actor.storeId)&&(target === "RESERVED" || target === "ATTENDED")) && b.status === "NO_SHOW") {
    const coupon=await tx.coursePointCard.findUnique({where:{storeId_requestKey:{storeId:actor.storeId,requestKey:`no-show-makeup:${b.id}`}},select:{id:true,remaining:true,closedAt:true}});
    if(coupon && !coupon.closedAt) {
      const used=await tx.courseBooking.count({where:{storeId:actor.storeId,cardId:coupon.id,status:{not:"CANCELLED"}}});
      if(used || coupon.remaining < b.pointCost)return fail("此缺席的補課券已使用或預約，請先處理補課再取消原堂");
      await tx.coursePointCard.update({where:{id:coupon.id},data:{remaining:0,closedAt:new Date()}});
      await tx.coursePointEntry.create({data:{storeId:actor.storeId,cardId:coupon.id,actorUserId:actor.userId,kind:sportsNativePreview(actor.storeId)?"VOID":`CANCEL_SOURCE:${b.id}`,points:coupon.remaining}});
    }
  }
  if (restoringLeave) {
    if(sportsNativePreview(actor.storeId)&&b.requestKey?.startsWith("sports-fixed:")&&await tx.courseBooking.findFirst({where:{storeId:actor.storeId,requestKey:{startsWith:`sports-makeup:${b.id}:`},OR:[{status:{not:"CANCELLED"}},{absenceKind:"STUDENT_LEAVE"}]}}))return fail("此請假已安排補課，請先取消補課再恢復原堂");
    if (["STUDENT_LEAVE", "TEACHER_ABSENT"].includes(b.absenceKind ?? "") && await tx.courseBooking.findFirst({where:{storeId:actor.storeId,makeupForBookingId:b.id,OR:[{status:{not:"CANCELLED"}},{absenceKind:"STUDENT_LEAVE"}]}})) return fail("此請假已安排補課，請先取消補課再恢復原堂");
    const [occupied, duplicate] = await Promise.all([
      tx.courseBooking.count({ where: { storeId: actor.storeId, sessionId: b.sessionId, status: { not: "CANCELLED" } } }),
      b.customerId ? tx.courseBooking.count({ where: { storeId: actor.storeId, sessionId: b.sessionId, customerId: b.customerId, status: { not: "CANCELLED" } } }) : Promise.resolve(0),
    ]);
    if (occupied >= b.session.capacity) return fail("本堂課名額已滿，無法恢復請假；請先處理名額");
    if (duplicate) return fail("此學員已有本堂課預約，無法重複恢復");
    if (b.card && !courseCardCoversDate(b.card, actor.storeId, b.session.startsAt)) return fail("方案不涵蓋本堂日期，無法恢復請假");
  }
  if (b.absenceKind === "TEACHER_ABSENT") await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","actorNameSnapshot","storeId",module,summary,"targetType","targetId",action,"beforeJson","afterJson","createdAt") VALUES (${crypto.randomUUID()},${actor.userId},${actor.name},${actor.storeId},'COURSE','恢復授課：學員回到待點名，未重扣','CourseBooking',${b.id},'COURSE_TEACHER_ABSENCE_RESTORE',${JSON.stringify({status:b.status,absenceKind:b.absenceKind})}::jsonb,${JSON.stringify({status:target,pointsUsed:0})}::jsonb,NOW())`;
  if (!b.card || !b.cardId) { if(b.bookingKind==="TRIAL")await auditTrialAttendance(tx,actor,b.id,b.status,target); const updated = await tx.courseBooking.update({where:{id:b.id},data:{status:target,absenceKind,checkedInAt:target === "ATTENDED" ? new Date() : null}}); if (sportsNativePreview(actor.storeId) || restoringLeave || target === "CANCELLED") await syncCourseRelease(tx, actor.storeId, b.sessionId); return updated; }
  const held = await tx.courseBooking.aggregate({ where: { storeId: actor.storeId, cardId: b.cardId, status: "RESERVED", id: { not: b.id } }, _sum: { pointCost: true } });
  const wasDebited=courseBookingWasDebited(b)||pilotLeave||nativeLeave;
  const willDebit=correctedCourseBookingWillDebit(target);
  const remaining = b.card.remaining + (wasDebited ? b.pointCost : 0);
  if ((willDebit || target === "RESERVED") && remaining - (held._sum.pointCost ?? 0) < b.pointCost) return fail("方案可用額度不足，無法更正");
  const delta = (wasDebited ? b.pointCost : 0) - (willDebit ? b.pointCost : 0);
  let activation: {expiresAt:Date;musicActivatedAt:Date|null}|null=null;
  if(opening.kind === "NATIVE" && b.card.musicValidityDays && willDebit && !wasDebited && !b.card.musicActivatedAt){
    const expiresAt=musicCourseExpiry(b.session.startsAt,b.card.musicValidityDays);
    if(expiresAt < b.session.startsAt) return fail("方案已到期，無法點名");
    activation={musicActivatedAt:b.session.startsAt,expiresAt};
  }
  if(opening.kind === "NATIVE" && b.card.musicValidityDays && wasDebited && !willDebit){
    const leaveIds = await nativeDeductedLeaveIds(tx,actor.storeId);
    const first=await tx.courseBooking.findFirst({where:{storeId:actor.storeId,cardId:b.cardId,id:{not:b.id},OR:[{status:{in:["ATTENDED","NO_SHOW"]}},{absenceKind:"GROUP_LEAVE_FORFEITED"},{id:{in:leaveIds},status:"CANCELLED",absenceKind:"STUDENT_LEAVE"}]},orderBy:{session:{startsAt:"asc"}},select:{session:{select:{startsAt:true}}}});
    const firstDate=first?.session.startsAt??null;
    if(!firstDate&&await isMusicPilotCard(tx,actor.storeId,b.card)){
      const reserved=await tx.courseBooking.findFirst({where:{storeId:actor.storeId,cardId:b.cardId,id:{not:b.id},status:"RESERVED"},orderBy:{session:{startsAt:"asc"}},select:{session:{select:{startsAt:true}}}});
      const projected=target==="RESERVED"&&(!reserved||b.session.startsAt<reserved.session.startsAt)?b.session.startsAt:reserved?.session.startsAt??b.session.startsAt;
      activation={musicActivatedAt:null,expiresAt:musicCourseExpiry(projected,b.card.musicValidityDays)};
    }else activation={musicActivatedAt:firstDate,expiresAt:firstDate ? musicCourseExpiry(firstDate,b.card.musicValidityDays) : dayRange("2099-12-31").end};
  }
  if (delta || activation) await tx.coursePointCard.update({ where: { id: b.cardId }, data: { ...(delta ? {remaining: { increment: delta }} : {}), ...(activation??{}) } });
  if(activation)await syncNativeMakeupExpiry(tx,actor.storeId,b.cardId,activation.expiresAt,activation.musicActivatedAt);
  // The durable entry constraint permits cancellation releases, but deliberately
  // does not permit CORRECT:*:CANCELLED. Preserve the transition in its audit.
  const correctionKey=crypto.randomUUID();
  const kind=target==="CANCELLED"?`RELEASE:${correctionKey}`:`CORRECT:${b.status}:${target}:${correctionKey}`;
  await tx.coursePointEntry.create({ data: { storeId: actor.storeId, cardId: b.cardId, bookingId: b.id, actorUserId: actor.userId, kind, points: b.pointCost } });
  if(target==="CANCELLED")await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","actorNameSnapshot","storeId",module,summary,"targetType","targetId",action,"beforeJson","afterJson","createdAt") VALUES (${correctionKey},${actor.userId},${actor.name},${actor.storeId},'COURSE',${options.waiveAbsence ? "更正為未出席不扣堂，保留額度返還紀錄" : "更正出席為取消，保留額度返還紀錄"},'CourseBooking',${b.id},'COURSE_ATTENDANCE_CANCEL_CORRECTION',${JSON.stringify({status:b.status,absenceKind:b.absenceKind})}::jsonb,${JSON.stringify({status:target,absenceKind,returnedPoints:delta,entryKind:kind})}::jsonb,NOW())`;
  if (sportsNativePreview(actor.storeId) && target === "NO_SHOW" && b.status !== "NO_SHOW" && b.requestKey.startsWith("sports-fixed:") && !b.card.termSessionIds?.length) {
    await grantCourseNoShowMakeup(tx, actor, b);
  }
  const deferred=sportsNativePreview(actor.storeId)&&target==="RESERVED"&&(b.requestKey?.startsWith("sports-fixed:")||b.requestKey?.startsWith("sports-makeup:"))&&b.bookingKind!=="TRIAL";
  const updated = await tx.courseBooking.update({ where: { id: b.id }, data: { status: target,...(deferred?{cardId:null,bookingKind:"UNPAID",pointCost:0,makeupForBookingId:null}:{}), absenceKind, checkedInAt: target === "ATTENDED" ? new Date() : null } });
  if(!options.suppressNotice&&(restoringLeave || target==="CANCELLED"))await recordCourseStoreNotice(tx,actor,{subjectKey:`booking:${b.id}`,kind:restoringLeave?"RESTORE":"CANCEL",customerName:b.customerName,courseName:b.session.nameSnapshot,coachId:b.session.coachId,startsAt:b.session.startsAt});
  if (sportsNativePreview(actor.storeId) || restoringLeave || target === "CANCELLED") await syncCourseRelease(tx, actor.storeId, b.sessionId);
  return updated;
}

async function auditTrialAttendance(tx:Prisma.TransactionClient,actor:CourseActor,id:string,before:string,after:string){
 await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","targetType","targetId",action,"beforeJson","afterJson","createdAt") VALUES (${crypto.randomUUID()},${actor.userId},'CourseBooking',${id},'TRIAL_ATTENDANCE',${JSON.stringify({storeId:actor.storeId,status:before})}::jsonb,${JSON.stringify({status:after,pointsUsed:0,paymentUnchanged:true})}::jsonb,NOW())`;
}


/** The caller holds the store lock: every booking is refunded together with teacher status. */
export async function refundTeacherAbsentSession(tx: Prisma.TransactionClient, actor: CourseActor, sessionId: string) {
  const bookings = await tx.courseBooking.findMany({
    where: { storeId: actor.storeId, sessionId, OR: [{ status: { not: "CANCELLED" } }, { absenceKind: { in: ["STUDENT_LEAVE", "GROUP_LEAVE_FORFEITED"] } }] },
    include: { session: true, card: { include: { members: true, musicOpeningState: { select: MUSIC_OPENING_SELECT } } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  // Preflight the complete batch so a bad second learner cannot follow a first write.
  const openings = new Map(bookings.map((booking) => [booking.id, assertOpeningBooking(actor.storeId, booking)]));
  const sourceKeys = new Set<string>();
  const ordinalKeys = new Set<string>();
  for (const booking of bookings) {
    if (openings.get(booking.id)?.kind !== "OPENING") continue;
    const sourceKey=JSON.stringify([booking.cardId,booking.musicOpeningSourceLessonKey]);
    const ordinalKey=JSON.stringify([booking.cardId,booking.musicOpeningTermKey,booking.musicOpeningLessonOrdinal]);
    if (sourceKeys.has(sourceKey) || ordinalKeys.has(ordinalKey)) return fail("期初來源堂次重複，整批尚未變更");
    sourceKeys.add(sourceKey);ordinalKeys.add(ordinalKey);
  }
  const activationCards = new Map<string, number>();
  for (const booking of bookings) {
    const nativeLeave=booking.absenceKind==="STUDENT_LEAVE"&&await nativeLeaveWasDebited(tx,actor.storeId,booking.id);
    const pilotLeave=booking.absenceKind==="STUDENT_LEAVE"&&await isMusicPilotCard(tx,actor.storeId,booking.card);
    if(pilotLeave)await closeUnusedMusicPilotMakeup(tx,actor.storeId,booking.id);
    if(nativeLeave)await closeNativeMusicMakeup(tx,actor.storeId,booking.id);
    const debited=courseBookingWasDebited(booking)||pilotLeave||nativeLeave;
    const refund = debited && booking.cardId ? booking.pointCost : 0;
    if (booking.cardId && booking.pointCost > 0 && (debited || booking.status === "RESERVED")) {
      if (refund) await tx.coursePointCard.update({ where: { id: booking.cardId }, data: { remaining: { increment: refund } } });
      await tx.coursePointEntry.create({ data: {
        storeId: actor.storeId, cardId: booking.cardId, bookingId: booking.id, actorUserId: actor.userId,
        kind: debited ? `CORRECT:${booking.status}:RESERVED:${crypto.randomUUID()}` : `RELEASE:${crypto.randomUUID()}`, points: booking.pointCost,
      } });
      if (openings.get(booking.id)?.kind === "NATIVE" && debited && booking.card?.musicValidityDays) activationCards.set(booking.cardId, booking.card.musicValidityDays);
    }
    await tx.courseBooking.update({ where: { id: booking.id }, data: { status: "CANCELLED", absenceKind: "TEACHER_ABSENT", checkedInAt: null } });
    await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","actorNameSnapshot","storeId",module,summary,"targetType","targetId",action,"beforeJson","afterJson","createdAt") VALUES (${crypto.randomUUID()},${actor.userId},${actor.name},${actor.storeId},'COURSE','教師未授課：返還扣點與釋放預留','CourseBooking',${booking.id},'COURSE_TEACHER_ABSENCE_REFUND',${JSON.stringify({storeId:actor.storeId,status:booking.status,absenceKind:booking.absenceKind,checkedInAt:booking.checkedInAt})}::jsonb,${JSON.stringify({status:"CANCELLED",absenceKind:"TEACHER_ABSENT",refundedPoints:refund,paymentUnchanged:true})}::jsonb,NOW())`;
  }
  // Recompute after all shared-card bookings have been removed from the deducted sequence.
  for (const [cardId, days] of activationCards) {
    const leaveIds = await nativeDeductedLeaveIds(tx,actor.storeId);
    const first = await tx.courseBooking.findFirst({ where: { storeId: actor.storeId, cardId, OR: [{ status: { in: ["ATTENDED", "NO_SHOW"] } }, { absenceKind: "GROUP_LEAVE_FORFEITED" }, {id:{in:leaveIds},status:"CANCELLED",absenceKind:"STUDENT_LEAVE"}] }, orderBy: { session: { startsAt: "asc" } }, select: { session: { select: { startsAt: true } } } });
    const date = first?.session.startsAt ?? null;
    const expiresAt=date ? musicCourseExpiry(date,days) : dayRange("2099-12-31").end;
    await tx.coursePointCard.update({ where: { id: cardId }, data: { musicActivatedAt: date, expiresAt } });
    await syncNativeMakeupExpiry(tx,actor.storeId,cardId,expiresAt,date);
  }
  return bookings.length;
}
