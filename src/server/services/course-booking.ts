import { enqueueOperationAudit } from "./operation-audit-outbox";
import { createHash } from "node:crypto";
import { resolveCustomerBookingWindow, type CustomerBookingWindowConfig } from "@/lib/shop-config";
import { getStoreLimitsByStoreId } from "@/lib/feature-gate";
import { courseMonthlyBookingWhere } from "@/lib/course-usage";
import { toLocalDateStr,dayRange } from "@/lib/date-utils";
import {musicCourseExpiry} from "@/lib/music-course-products";
import "server-only";
import { AppError } from "@/lib/errors";
import { courseTransaction } from "./course-access";
import type { Prisma } from "../../../generated/course-client";

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
  const [active, leave] = await Promise.all([
    tx.courseBooking.count({ where: { storeId, sessionId, status: { not: "CANCELLED" } } }),
    tx.courseBooking.count({ where: { storeId, sessionId, status: "CANCELLED", absenceKind: { in: ["STUDENT_LEAVE", "GROUP_LEAVE_FORFEITED"] } } }),
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

export async function reserveCourse(
  actor: CourseActor,
  input: {
    sessionId: string;
    cardId: string;
    customerId: string;
    requestKey: string;
    notes?: string;
    makeupForBookingId?: string | null;
    allowOverCapacity?: boolean;
  },
) {
  const limits = await getStoreLimitsByStoreId(actor.storeId);
  return courseTransaction(actor.storeId, async (tx) => {
    return reserveCourseInTransaction(
      tx,
      actor,
      input,
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

export async function reserveTrialCourse(actor: CourseActor, input: { sessionId: string; customerId: string; requestKey: string; notes?: string; allowOverCapacity?:boolean; trialPrice: number }) {
  const limits = await getStoreLimitsByStoreId(actor.storeId);
  return courseTransaction(actor.storeId, tx => reserveCourseInTransaction(tx, actor, { ...input, cardId: null }, limits.maxMonthlyBookings));
}

export async function reserveCourseInTransaction(
  tx: Prisma.TransactionClient,
  actor: CourseActor,
  input: {
    sessionId: string;
    cardId: string | null;
    trialPrice?: number;
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
) {
  const { storeId } = actor;
  const previous = await tx.courseBooking.findUnique({
    where: { storeId_requestKey: { storeId, requestKey: input.requestKey } },
  });
  if (previous) {
    if (
      previous.operatorUserId !== actor.userId ||
      previous.sessionId !== input.sessionId ||
      previous.cardId !== input.cardId ||
      previous.customerId !== input.customerId ||
      (previous.companionIndex ?? null) !== (input.companionIndex ?? null) ||
      (input.companionIndex && previous.customerName !== input.customerName) ||
      (previous.makeupForBookingId ?? null) !== (input.makeupForBookingId ?? null) ||
      (input.cardId === null && previous.trialPrice !== input.trialPrice)
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
      include: { template: {select:{visibility:true,isActive:true,musicSubject:{select:{isActive:true}}}} },
    }),
    input.cardId ? tx.coursePointCard.findFirst({
      where: { id: input.cardId, storeId },
      include: { members: true, plan: { select: { allowShared: true } } },
    }) : Promise.resolve(null),
    tx.courseBookingRule.findUnique({ where: { storeId } }),
    input.customerId ? tx.$queryRaw<
      Array<{ id: string; name: string }>
    >`SELECT id, name FROM "Customer" WHERE id = ${input.customerId} AND "storeId" = ${storeId} AND "mergedIntoCustomerId" IS NULL` : Promise.resolve([]),
  ]);
  if (session && ["LEAVE", "NO_SHOW"].includes(session.teacherAttendance)) return fail("教師未授課，無法預約本堂");
  if (!session || (input.cardId !== null && !card) || (!input.companionIndex && !customers.length))
    return fail("請選擇本店有效課程、方案與上課人");
  if (session.releasedAt) return fail("此課原時段已釋出，請先處理現有排課再恢復預約");
  if (!session.template.isActive || session.template.musicSubject?.isActive===false || session.template.visibility === "OFF" || (actor.customerId && session.template.visibility !== "PUBLIC")) return fail("本課程目前不開放新增預約，既有預約仍可查閱與依規則取消");
  if (card && (
    (!input.companionIndex && !card.members.some((m) => m.customerId === input.customerId)) ||
    (actor.customerId &&
      !card.members.some((m) => m.customerId === actor.customerId))
  ))
    return fail("僅能替此共卡的授權成員預約");
  if (input.companionIndex) {
    const music = await tx.$queryRaw<Array<{featureKey: string}>>`SELECT "featureKey" FROM "StoreFeatureEntitlement" WHERE "storeId"=${storeId} AND "featureKey"='business.music' AND status::text='ENABLED' LIMIT 1`;
    if (music.length || card?.termSessionIds.length || !card?.plan.allowShared || !input.reserverCustomerId || !card.members.some(m => m.customerId === input.reserverCustomerId))
      return fail("此方案未開放自由選課同行預約");
    if (input.customerId || !Number.isInteger(input.companionIndex) || input.companionIndex < 1 || input.companionIndex > 2 || !input.customerName || input.customerName.length > 100 || (actor.customerId && actor.customerId !== input.reserverCustomerId))
      return fail("同行預約資料不正確");
  }
  if (card && card.unit !== "SESSION") {
    const music=await tx.$queryRaw<Array<{featureKey:string}>>`SELECT "featureKey" FROM "StoreFeatureEntitlement" WHERE "storeId"=${storeId} AND "featureKey"='business.music' AND status::text='ENABLED' LIMIT 1`;
    if(music.some(row=>row.featureKey==="business.music"))return fail("音樂教室只使用堂數方案，不能以點數預約");
  }
  if(card?.termSessionIds?.length&&!card.termSessionIds.includes(session.id))return fail("期課方案僅能使用指定課次");
  if (card?.closedAt) return fail("此方案已退款或結清，不能預約");
  if (card?.templateIds?.length && !card.templateIds.includes(session.templateId)) return fail("此方案不適用本堂課");
  if(card?.musicJoinSessionId) {
    const first=await tx.courseSession.findFirst({where:{id:card.musicJoinSessionId,storeId},select:{startsAt:true}});
    if(!first || session.startsAt<first.startsAt)return fail("此插班方案尚未到首次上課日期");
  }
  if (input.makeupForBookingId) {
    if (actor.customerId || !card || card.unit !== "SESSION") return fail("補課僅由店長使用原堂數方案安排");
    const music = await tx.$queryRaw<Array<{featureKey:string}>>`SELECT "featureKey" FROM "StoreFeatureEntitlement" WHERE "storeId"=${storeId} AND "featureKey"='business.music' AND status::text='ENABLED' LIMIT 1`;
    const source = await tx.courseBooking.findFirst({where:{id:input.makeupForBookingId,storeId,customerId:input.customerId,cardId:card.id,status:"CANCELLED",absenceKind:"STUDENT_LEAVE"},include:{session:{include:{template:true}}}});
    if (!music.length || !source || source.session.template.classType === "GROUP" || source.session.templateId !== session.templateId || source.session.startsAt >= session.startsAt) return fail("請選擇此學員同課程、原方案的待補課紀錄");
    if (await tx.courseBooking.findFirst({where:{storeId,makeupForBookingId:source.id,OR:[{status:{not:"CANCELLED"}},{absenceKind:"STUDENT_LEAVE"}]}})) return fail("這次請假已安排補課，請重新選擇");
  }
  const bookingCost = card ? (card.unit === "SESSION" ? 1 : session.pointCost) : 0;
  if (!card && (!Number.isSafeInteger(input.trialPrice) || input.trialPrice! < 0 || input.trialPrice! > 1000000 || actor.customerId)) return fail("體驗預約僅由有權限店長建立");
  const now = new Date();
  if (
    !(input.onSite && !actor.customerId && session.endsAt > now) &&
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
  if (card && (card.expiresAt < now || card.expiresAt < session.startsAt))
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
  if (session.template.musicSubject) {
    const overlap = await tx.courseBooking.findFirst({where:{storeId,customerId:input.customerId,status:{not:"CANCELLED"},session:{cancelledAt:null,releasedAt:null,startsAt:{lt:session.endsAt},endsAt:{gt:session.startsAt}}},select:{id:true}});
    if(overlap) return fail("學員同時段已有課程，請先調整上課時間");
  }
  if (card && card.remaining - (held._sum.pointCost ?? 0) < bookingCost)
    return fail(card.unit === "SESSION" ? "方案可用堂數不足" : "方案可用點數不足");
  const booking = await tx.courseBooking.create({
    data: {
      sessionId:input.sessionId,cardId:input.cardId,customerId:input.customerId,requestKey:input.requestKey,
      notes:input.notes,makeupForBookingId:input.makeupForBookingId,trialPrice:input.trialPrice,
      bookingKind: card ? "CARD" : "TRIAL",
      storeId,
      pointCost: bookingCost,
      operatorUserId: actor.userId,
      operatorCustomerId: actor.customerId ?? null,
      operatorName: actor.name,
      customerName: input.companionIndex ? input.customerName! : customers[0].name,
      companionIndex: input.companionIndex,
      reserverCustomerId: input.reserverCustomerId,
      reserverName: input.reserverName,
      reserverCardId: input.reserverCardId,
      groupKey: input.groupKey,
    },
  });
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
  await enqueueOperationAudit({ actorUserId: actor.userId, actorNameSnapshot: actor.name, storeId, module: "COURSE", targetType: "CourseBooking", targetId: booking.id, action: "CREATE", summary: "建立課程預約" }, tx, input.requestKey);
  return booking;
}

export async function settleCourseBooking(
  tx: Prisma.TransactionClient,
  actor: CourseActor,
  bookingId: string,
  target: "CANCELLED" | "ATTENDED" | "CHECKED_IN" | "NO_SHOW" | "STUDENT_LEAVE",
  noShowChoice: CourseNoShowChoice = "DEDUCTED",
) {
  const booking = await tx.courseBooking.findFirst({
    where: { id: bookingId, storeId: actor.storeId },
    include: { session: true, card: { include: { members: true } } },
  });
  if (!booking) return fail("找不到本店預約");
  if (["LEAVE", "NO_SHOW"].includes(booking.session.teacherAttendance) && target !== "CANCELLED") return fail("教師未授課，本堂免點名；請先恢復授課");
  if (target === "NO_SHOW" && noShowChoice === "DEDUCTED_WITH_MAKEUP") {
    const music = await tx.$queryRaw<Array<{featureKey:string}>>`
      SELECT "featureKey" FROM "StoreFeatureEntitlement"
      WHERE "storeId"=${actor.storeId} AND "featureKey"='business.music' AND status::text='ENABLED' LIMIT 1`;
    if (music.some(item => item.featureKey === "business.music"))
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
  if (target === "STUDENT_LEAVE" && actor.customerId) return fail("請假登記僅限有權限的人員");
  if (target === "CHECKED_IN" || target === "NO_SHOW") {
    if (actor.customerId) return fail("點名僅限有權限的人員");
    if (target === "CHECKED_IN") {
      if (booking.checkedInAt) return booking;
      if (!booking.cardId) await auditTrialAttendance(tx, actor, booking.id, booking.status, "CHECKED_IN");
      return tx.courseBooking.update({
        where: { id: booking.id },
        data: { checkedInAt: new Date() },
      });
    }
  }
  const musicGroupLeave = target === "STUDENT_LEAVE" && booking.cardId &&
    (await tx.$queryRaw<Array<{featureKey:string}>>`
      SELECT "featureKey" FROM "StoreFeatureEntitlement"
      WHERE "storeId"=${actor.storeId} AND "featureKey"='business.music' AND status::text='ENABLED' LIMIT 1`
    ).some(item => item.featureKey === "business.music") &&
    (await tx.courseTemplate.findFirst({where:{id:booking.session.templateId,storeId:actor.storeId},select:{classType:true}}))?.classType === "GROUP";
  const shouldDebit =
    target === "ATTENDED" || (target === "NO_SHOW" && !!booking.cardId) || !!musicGroupLeave;
  if (shouldDebit) {
    if (actor.customerId) return fail("點名僅限有權限的人員");
    if (booking.cardId) {
    const expiry=booking.card?.musicValidityDays && !booking.card.musicActivatedAt ? musicCourseExpiry(booking.session.startsAt,booking.card.musicValidityDays) : null;
    if(booking.card?.musicValidityDays && booking.card.musicActivatedAt && booking.card.expiresAt < booking.session.startsAt)
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
  } else if (actor.customerId) {
    const rule = await tx.courseBookingRule.findUnique({
      where: { storeId: actor.storeId },
    });
    if (
      booking.session.startsAt.getTime() <=
      Date.now() + (rule?.cancellationLeadMinutes ?? 0) * 60000
    )
      return fail("已超過取消截止時間，請聯絡店家");
  }
  const updated = await tx.courseBooking.update({
    where: { id: booking.id },
    data: { status: target === "STUDENT_LEAVE" ? "CANCELLED" : target, absenceKind: target === "STUDENT_LEAVE" ? (musicGroupLeave ? "GROUP_LEAVE_FORFEITED" : "STUDENT_LEAVE") : null },
  });
  if (target === "STUDENT_LEAVE" || target === "CANCELLED") await syncCourseRelease(tx, actor.storeId, booking.sessionId);
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
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + COURSE_MAKEUP_VALID_DAYS);
    const makeupCard = await tx.coursePointCard.create({
      data: {
        storeId: actor.storeId,
        planId: booking.card.planId,
        nameSnapshot: `補課券（${COURSE_MAKEUP_VALID_DAYS}日）`,
        unit: booking.card.unit,
        templateIds: [booking.session.templateId],
        termSessionIds: [],
        remaining: booking.pointCost,
        expiresAt,
        requestKey: `no-show-makeup:${booking.id}`,
      },
    });
    await tx.courseCardMember.create({
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
  return updated;
}

// Caller must hold the course store lock and independently authorize the coach.
export async function correctCourseAttendance(
  tx: Prisma.TransactionClient, actor: CourseActor, bookingId: string,
  target: "RESERVED" | "ATTENDED" | "NO_SHOW" | "CANCELLED", expectedStatus: string,
) {
  const b = await tx.courseBooking.findFirst({ where: { id: bookingId, storeId: actor.storeId }, include: { session: true, card: true } });
  const restoringLeave = b?.status === "CANCELLED" && ["STUDENT_LEAVE", "GROUP_LEAVE_FORFEITED", "TEACHER_ABSENT"].includes(b.absenceKind ?? "") && target === "RESERVED" && expectedStatus === "CANCELLED";
  const cancellingLeave = target === "CANCELLED" && b?.status === "CANCELLED" && ["STUDENT_LEAVE", "GROUP_LEAVE_FORFEITED"].includes(b.absenceKind ?? "");
  if (!b || (b.status === "CANCELLED" && !restoringLeave && !cancellingLeave) || b.session.cancelledAt) return fail("此預約無法更正");
  if (["LEAVE", "NO_SHOW"].includes(b.session.teacherAttendance)) return fail("教師未授課，本堂免點名；請先恢復授課");
  if (b.status === target && !cancellingLeave) return b;
  if (b.card?.closedAt) return fail("此方案已退款或結清，無法更正出席額度");
  if (b.status !== expectedStatus) return fail("另一位人員已更新點名，請重新確認");
  if (target === "CANCELLED" && b.status === "NO_SHOW") {
    const coupon=await tx.coursePointCard.findUnique({where:{storeId_requestKey:{storeId:actor.storeId,requestKey:`no-show-makeup:${b.id}`}},select:{id:true,remaining:true,closedAt:true}});
    if(coupon && !coupon.closedAt) {
      const used=await tx.courseBooking.count({where:{storeId:actor.storeId,cardId:coupon.id,status:{not:"CANCELLED"}}});
      if(used || coupon.remaining < b.pointCost)return fail("此缺席的補課券已使用或預約，請先處理補課再取消原堂");
      await tx.coursePointCard.update({where:{id:coupon.id},data:{remaining:0,closedAt:new Date()}});
      await tx.coursePointEntry.create({data:{storeId:actor.storeId,cardId:coupon.id,actorUserId:actor.userId,kind:`CANCEL_SOURCE:${b.id}`,points:coupon.remaining}});
    }
  }
  if (restoringLeave) {
    if (["STUDENT_LEAVE", "TEACHER_ABSENT"].includes(b.absenceKind ?? "") && await tx.courseBooking.findFirst({where:{storeId:actor.storeId,makeupForBookingId:b.id,OR:[{status:{not:"CANCELLED"}},{absenceKind:"STUDENT_LEAVE"}]}})) return fail("此請假已安排補課，請先取消補課再恢復原堂");
    const [occupied, duplicate] = await Promise.all([
      tx.courseBooking.count({ where: { storeId: actor.storeId, sessionId: b.sessionId, status: { not: "CANCELLED" } } }),
      b.customerId ? tx.courseBooking.count({ where: { storeId: actor.storeId, sessionId: b.sessionId, customerId: b.customerId, status: { not: "CANCELLED" } } }) : Promise.resolve(0),
    ]);
    if (occupied >= b.session.capacity) return fail("本堂課名額已滿，無法恢復請假；請先處理名額");
    if (duplicate) return fail("此學員已有本堂課預約，無法重複恢復");
    if (b.card && b.card.expiresAt < b.session.startsAt) return fail("方案不涵蓋本堂日期，無法恢復請假");
  }
  if (b.absenceKind === "TEACHER_ABSENT") await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","actorNameSnapshot","storeId",module,summary,"targetType","targetId",action,"beforeJson","afterJson","createdAt") VALUES (${crypto.randomUUID()},${actor.userId},${actor.name},${actor.storeId},'COURSE','恢復授課：學員回到待點名，未重扣','CourseBooking',${b.id},'COURSE_TEACHER_ABSENCE_RESTORE',${JSON.stringify({status:b.status,absenceKind:b.absenceKind})}::jsonb,${JSON.stringify({status:target,pointsUsed:0})}::jsonb,NOW())`;
  if (!b.card || !b.cardId) { if(b.bookingKind==="TRIAL")await auditTrialAttendance(tx,actor,b.id,b.status,target); const updated = await tx.courseBooking.update({where:{id:b.id},data:{status:target,absenceKind:null,checkedInAt:target === "ATTENDED" ? new Date() : null}}); if (restoringLeave || target === "CANCELLED") await syncCourseRelease(tx, actor.storeId, b.sessionId); return updated; }
  const held = await tx.courseBooking.aggregate({ where: { storeId: actor.storeId, cardId: b.cardId, status: "RESERVED", id: { not: b.id } }, _sum: { pointCost: true } });
  const wasDebited=b.status==="ATTENDED"||b.status==="NO_SHOW"||b.absenceKind==="GROUP_LEAVE_FORFEITED";
  const willDebit=target==="ATTENDED"||target==="NO_SHOW";
  const remaining = b.card.remaining + (wasDebited ? b.pointCost : 0);
  if ((willDebit || target === "RESERVED") && remaining - (held._sum.pointCost ?? 0) < b.pointCost) return fail("方案可用額度不足，無法更正");
  const delta = (wasDebited ? b.pointCost : 0) - (willDebit ? b.pointCost : 0);
  let activation: {expiresAt:Date;musicActivatedAt:Date|null}|null=null;
  if(b.card.musicValidityDays && willDebit && !wasDebited && !b.card.musicActivatedAt){
    const expiresAt=musicCourseExpiry(b.session.startsAt,b.card.musicValidityDays);
    if(expiresAt < b.session.startsAt) return fail("方案已到期，無法點名");
    activation={musicActivatedAt:b.session.startsAt,expiresAt};
  }
  if(b.card.musicValidityDays && wasDebited && !willDebit){
    const first=await tx.courseBooking.findFirst({where:{storeId:actor.storeId,cardId:b.cardId,id:{not:b.id},OR:[{status:{in:["ATTENDED","NO_SHOW"]}},{absenceKind:"GROUP_LEAVE_FORFEITED"}]},orderBy:{session:{startsAt:"asc"}},select:{session:{select:{startsAt:true}}}});
    const firstDate=first?.session.startsAt??null;
    activation={musicActivatedAt:firstDate,expiresAt:firstDate ? musicCourseExpiry(firstDate,b.card.musicValidityDays) : dayRange("2099-12-31").end};
  }
  if (delta || activation) await tx.coursePointCard.update({ where: { id: b.cardId }, data: { ...(delta ? {remaining: { increment: delta }} : {}), ...(activation??{}) } });
  await tx.coursePointEntry.create({ data: { storeId: actor.storeId, cardId: b.cardId, bookingId: b.id, actorUserId: actor.userId, kind: `CORRECT:${b.status}:${target}:${crypto.randomUUID()}`, points: b.pointCost } });
  const updated = await tx.courseBooking.update({ where: { id: b.id }, data: { status: target, absenceKind: null, checkedInAt: target === "ATTENDED" ? new Date() : null } });
  if (restoringLeave || target === "CANCELLED") await syncCourseRelease(tx, actor.storeId, b.sessionId);
  return updated;
}

async function auditTrialAttendance(tx:Prisma.TransactionClient,actor:CourseActor,id:string,before:string,after:string){
 await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","targetType","targetId",action,"beforeJson","afterJson","createdAt") VALUES (${crypto.randomUUID()},${actor.userId},'CourseBooking',${id},'TRIAL_ATTENDANCE',${JSON.stringify({storeId:actor.storeId,status:before})}::jsonb,${JSON.stringify({status:after,pointsUsed:0,paymentUnchanged:true})}::jsonb,NOW())`;
}


/** The caller holds the store lock: every booking is refunded together with teacher status. */
export async function refundTeacherAbsentSession(tx: Prisma.TransactionClient, actor: CourseActor, sessionId: string) {
  const bookings = await tx.courseBooking.findMany({
    where: { storeId: actor.storeId, sessionId, OR: [{ status: { not: "CANCELLED" } }, { absenceKind: { in: ["STUDENT_LEAVE", "GROUP_LEAVE_FORFEITED"] } }] },
    include: { card: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const activationCards = new Map<string, number>();
  for (const booking of bookings) {
    const debited = booking.status === "ATTENDED" || booking.status === "NO_SHOW" || booking.absenceKind === "GROUP_LEAVE_FORFEITED";
    const refund = debited && booking.cardId ? booking.pointCost : 0;
    if (booking.cardId && booking.pointCost > 0 && (debited || booking.status === "RESERVED")) {
      if (refund) await tx.coursePointCard.update({ where: { id: booking.cardId }, data: { remaining: { increment: refund } } });
      await tx.coursePointEntry.create({ data: {
        storeId: actor.storeId, cardId: booking.cardId, bookingId: booking.id, actorUserId: actor.userId,
        kind: debited ? `CORRECT:${booking.status}:RESERVED:${crypto.randomUUID()}` : `RELEASE:${crypto.randomUUID()}`, points: booking.pointCost,
      } });
      if (debited && booking.card?.musicValidityDays) activationCards.set(booking.cardId, booking.card.musicValidityDays);
    }
    await tx.courseBooking.update({ where: { id: booking.id }, data: { status: "CANCELLED", absenceKind: "TEACHER_ABSENT", checkedInAt: null } });
    await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","actorNameSnapshot","storeId",module,summary,"targetType","targetId",action,"beforeJson","afterJson","createdAt") VALUES (${crypto.randomUUID()},${actor.userId},${actor.name},${actor.storeId},'COURSE','教師未授課：返還扣點與釋放預留','CourseBooking',${booking.id},'COURSE_TEACHER_ABSENCE_REFUND',${JSON.stringify({storeId:actor.storeId,status:booking.status,absenceKind:booking.absenceKind,checkedInAt:booking.checkedInAt})}::jsonb,${JSON.stringify({status:"CANCELLED",absenceKind:"TEACHER_ABSENT",refundedPoints:refund,paymentUnchanged:true})}::jsonb,NOW())`;
  }
  // Recompute after all shared-card bookings have been removed from the deducted sequence.
  for (const [cardId, days] of activationCards) {
    const first = await tx.courseBooking.findFirst({ where: { storeId: actor.storeId, cardId, OR: [{ status: { in: ["ATTENDED", "NO_SHOW"] } }, { absenceKind: "GROUP_LEAVE_FORFEITED" }] }, orderBy: { session: { startsAt: "asc" } }, select: { session: { select: { startsAt: true } } } });
    const date = first?.session.startsAt ?? null;
    await tx.coursePointCard.update({ where: { id: cardId }, data: { musicActivatedAt: date, expiresAt: date ? musicCourseExpiry(date, days) : dayRange("2099-12-31").end } });
  }
  return bookings.length;
}
