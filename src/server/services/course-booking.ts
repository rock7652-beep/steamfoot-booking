import { createHash } from "node:crypto";
import { resolveCustomerBookingWindow, type CustomerBookingWindowConfig } from "@/lib/shop-config";
import { getStoreLimitsByStoreId } from "@/lib/feature-gate";
import { monthRange, toLocalMonthStr, toLocalDateStr } from "@/lib/date-utils";
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
    requestKey: string;
    notes?: string;
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
    .update(JSON.stringify([input.requestKey, customers]))
    .digest("hex");
  return courseTransaction(actor.storeId, async (tx) => {
    const bookings = [];
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
          },
          limits.maxMonthlyBookings,
        ),
      );
    }
    return bookings;
  });
}

export async function reserveTrialCourse(actor: CourseActor, input: { sessionId: string; customerId: string; requestKey: string; notes?: string; trialPrice: number }) {
  const limits = await getStoreLimitsByStoreId(actor.storeId);
  return courseTransaction(actor.storeId, tx => reserveCourseInTransaction(tx, actor, { ...input, cardId: null }, limits.maxMonthlyBookings));
}

async function reserveCourseInTransaction(
  tx: Prisma.TransactionClient,
  actor: CourseActor,
  input: {
    sessionId: string;
    cardId: string | null;
    trialPrice?: number;
    customerId: string;
    requestKey: string;
    notes?: string;
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
      (input.cardId === null && previous.trialPrice !== input.trialPrice)
    )
      fail("預約請求已使用，請重新開啟表單");
    return previous;
  }
  if (maxMonthlyBookings !== null) {
    const bounds = monthRange(toLocalMonthStr());
    const used = await tx.courseBooking.count({
      where: { storeId, createdAt: { gte: bounds.start, lte: bounds.end } },
    });
    if (used >= maxMonthlyBookings)
      throw new AppError("FORBIDDEN", "已達方案本月預約額度上限");
  }
  const [session, card, rule, customers] = await Promise.all([
    tx.courseSession.findFirst({
      where: { id: input.sessionId, storeId, cancelledAt: null },
    }),
    input.cardId ? tx.coursePointCard.findFirst({
      where: { id: input.cardId, storeId },
      include: { members: true },
    }) : Promise.resolve(null),
    tx.courseBookingRule.findUnique({ where: { storeId } }),
    tx.$queryRaw<
      Array<{ id: string; name: string }>
    >`SELECT id, name FROM "Customer" WHERE id = ${input.customerId} AND "storeId" = ${storeId} AND "mergedIntoCustomerId" IS NULL`,
  ]);
  if (!session || (input.cardId !== null && !card) || !customers.length)
    return fail("請選擇本店有效課程、方案與上課人");
  if (card && (
    !card.members.some((m) => m.customerId === input.customerId) ||
    (actor.customerId &&
      !card.members.some((m) => m.customerId === actor.customerId))
  ))
    return fail("僅能替此共卡的授權成員預約");
  if (card?.closedAt) return fail("此方案已退款或結清，不能預約");
  if (card?.templateIds?.length && !card.templateIds.includes(session.templateId)) return fail("此方案不適用本堂課");
  const bookingCost = card ? (card.unit === "SESSION" ? 1 : session.pointCost) : 0;
  if (!card && (!Number.isSafeInteger(input.trialPrice) || input.trialPrice! < 0 || input.trialPrice! > 1000000 || actor.customerId)) return fail("體驗預約僅由有權限店長建立");
  const now = new Date();
  if (
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
  const [duplicate, occupied, held] = await Promise.all([
    tx.courseBooking.findFirst({
      where: {
        storeId,
        sessionId: session.id,
        customerId: input.customerId,
        status: { not: "CANCELLED" },
      },
    }),
    tx.courseBooking.count({
      where: { storeId, sessionId: session.id, status: { not: "CANCELLED" } },
    }),
    card ? tx.courseBooking.aggregate({
      where: { storeId, cardId: card.id, status: "RESERVED" },
      _sum: { pointCost: true },
    }) : Promise.resolve({_sum:{pointCost:0}}),
  ]);
  if (duplicate) return fail("此上課人已預約本堂課");
  if (occupied >= session.capacity) return fail("本堂課已滿班");
  if (card && card.remaining - (held._sum.pointCost ?? 0) < bookingCost)
    return fail("方案可用點數不足");
  const booking = await tx.courseBooking.create({
    data: {
      ...input,
      bookingKind: card ? "CARD" : "TRIAL",
      storeId,
      pointCost: bookingCost,
      operatorUserId: actor.userId,
      operatorCustomerId: actor.customerId ?? null,
      operatorName: actor.name,
      customerName: customers[0].name,
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
  return booking;
}

export async function settleCourseBooking(
  tx: Prisma.TransactionClient,
  actor: CourseActor,
  bookingId: string,
  target: "CANCELLED" | "ATTENDED" | "CHECKED_IN" | "NO_SHOW",
) {
  const booking = await tx.courseBooking.findFirst({
    where: { id: bookingId, storeId: actor.storeId },
    include: { session: true, card: { include: { members: true } } },
  });
  if (!booking) return fail("找不到本店預約");
  if (
    actor.customerId &&
    !(booking.card ? booking.card.members.some((m) => m.customerId === actor.customerId) : booking.customerId === actor.customerId)
  )
    return fail("無權操作此共卡預約");
  if (booking.status === target) return booking;
  if (booking.status !== "RESERVED")
    return fail("此預約已結算或取消，不能重複操作");
  if (target === "CHECKED_IN" || target === "NO_SHOW") {
    if (actor.customerId) return fail("點名僅限有權限的人員");
    if (target === "NO_SHOW" && booking.session.startsAt > new Date())
      return fail("課程尚未開始，不能標記未到");
    if (target === "CHECKED_IN") {
      if (booking.checkedInAt) return booking;
      if (!booking.cardId) await auditTrialAttendance(tx, actor, booking.id, booking.status, "CHECKED_IN");
      return tx.courseBooking.update({
        where: { id: booking.id },
        data: { checkedInAt: new Date() },
      });
    }
  }
  if (target === "ATTENDED") {
    if (actor.customerId) return fail("點名僅限有權限的人員");
    if (booking.session.startsAt > new Date())
      return fail("課程尚未開始，不能點名扣點");
    if (booking.cardId) {
    const updated = await tx.coursePointCard.updateMany({
      where: {
        id: booking.cardId,
        storeId: actor.storeId,
        remaining: { gte: booking.pointCost },
      },
      data: { remaining: { decrement: booking.pointCost } },
    });
    if (!updated.count) return fail("點數帳目異常，尚未完成點名");
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
    data: { status: target },
  });
  if (!booking.cardId) { await auditTrialAttendance(tx,actor,booking.id,booking.status,target); return updated; }
  const kind = target === "ATTENDED" ? "DEBIT" : "RELEASE";
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
  return updated;
}

// Caller must hold the course store lock and independently authorize the coach.
export async function correctCourseAttendance(
  tx: Prisma.TransactionClient, actor: CourseActor, bookingId: string,
  target: "RESERVED" | "ATTENDED" | "NO_SHOW", expectedStatus: string,
) {
  const b = await tx.courseBooking.findFirst({ where: { id: bookingId, storeId: actor.storeId }, include: { session: true, card: true } });
  if (!b || b.status === "CANCELLED" || b.session.cancelledAt) return fail("此預約無法更正");
  if (b.status === target) return b;
  if (b.card?.closedAt) return fail("此方案已退款或結清，無法更正出席額度");
  if (b.status !== expectedStatus) return fail("另一位人員已更新點名，請重新確認");
  if (b.session.startsAt > new Date()) return fail("課程尚未開始，不能點名");
  if (!b.card || !b.cardId) { await auditTrialAttendance(tx,actor,b.id,b.status,target); return tx.courseBooking.update({where:{id:b.id},data:{status:target,checkedInAt:target === "ATTENDED" ? new Date() : null}}); }
  const held = await tx.courseBooking.aggregate({ where: { storeId: actor.storeId, cardId: b.cardId, status: "RESERVED", id: { not: b.id } }, _sum: { pointCost: true } });
  const remaining = b.card.remaining + (b.status === "ATTENDED" ? b.pointCost : 0);
  if ((target === "ATTENDED" || target === "RESERVED") && remaining - (held._sum.pointCost ?? 0) < b.pointCost) return fail("方案可用額度不足，無法更正");
  const delta = (b.status === "ATTENDED" ? b.pointCost : 0) - (target === "ATTENDED" ? b.pointCost : 0);
  if (delta) await tx.coursePointCard.update({ where: { id: b.cardId }, data: { remaining: { increment: delta } } });
  await tx.coursePointEntry.create({ data: { storeId: actor.storeId, cardId: b.cardId, bookingId: b.id, actorUserId: actor.userId, kind: `CORRECT:${b.status}:${target}:${crypto.randomUUID()}`, points: b.pointCost } });
  return tx.courseBooking.update({ where: { id: b.id }, data: { status: target, checkedInAt: target === "ATTENDED" ? new Date() : null } });
}

async function auditTrialAttendance(tx:Prisma.TransactionClient,actor:CourseActor,id:string,before:string,after:string){
 await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","targetType","targetId",action,"beforeJson","afterJson","createdAt") VALUES (${crypto.randomUUID()},${actor.userId},'CourseBooking',${id},'TRIAL_ATTENDANCE',${JSON.stringify({storeId:actor.storeId,status:before})}::jsonb,${JSON.stringify({status:after,pointsUsed:0,paymentUnchanged:true})}::jsonb,NOW())`;
}
