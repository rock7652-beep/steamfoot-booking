import { getStoreLimitsByStoreId } from "@/lib/feature-gate";
import { monthRange, toLocalMonthStr } from "@/lib/date-utils";
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
  },
) {
  const limits = await getStoreLimitsByStoreId(actor.storeId);
  return courseTransaction(actor.storeId, async (tx) => {
    const { storeId } = actor;
    const previous = await tx.courseBooking.findUnique({
      where: { storeId_requestKey: { storeId, requestKey: input.requestKey } },
    });
    if (previous) {
      if (
        previous.operatorUserId !== actor.userId ||
        previous.sessionId !== input.sessionId ||
        previous.cardId !== input.cardId ||
        previous.customerId !== input.customerId
      )
        fail("預約請求已使用，請重新開啟表單");
      return previous;
    }
    if (limits.maxMonthlyBookings !== null) {
      const bounds = monthRange(toLocalMonthStr());
      const used = await tx.courseBooking.count({
        where: { storeId, createdAt: { gte: bounds.start, lte: bounds.end } },
      });
      if (used >= limits.maxMonthlyBookings)
        throw new AppError("FORBIDDEN", "已達方案本月預約額度上限");
    }
    const [session, card, rule, customers] = await Promise.all([
      tx.courseSession.findFirst({
        where: { id: input.sessionId, storeId, cancelledAt: null },
      }),
      tx.coursePointCard.findFirst({
        where: { id: input.cardId, storeId },
        include: { members: true },
      }),
      tx.courseBookingRule.findUnique({ where: { storeId } }),
      tx.$queryRaw<
        Array<{ id: string; name: string }>
      >`SELECT id, name FROM "Customer" WHERE id = ${input.customerId} AND "storeId" = ${storeId} AND "mergedIntoCustomerId" IS NULL`,
    ]);
    if (!session || !card || !customers.length)
      return fail("請選擇本店有效課程、方案與上課人");
    if (
      !card.members.some((m) => m.customerId === input.customerId) ||
      (actor.customerId &&
        !card.members.some((m) => m.customerId === actor.customerId))
    )
      return fail("僅能替此共卡的授權成員預約");
    const now = new Date();
    if (
      session.startsAt.getTime() <=
      now.getTime() + (rule?.bookingLeadMinutes ?? 0) * 60000
    )
      return fail("已超過預約截止時間");
    if (card.expiresAt < now || card.expiresAt < session.startsAt)
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
      tx.courseBooking.aggregate({
        where: { storeId, cardId: card.id, status: "RESERVED" },
        _sum: { pointCost: true },
      }),
    ]);
    if (duplicate) return fail("此上課人已預約本堂課");
    if (occupied >= session.capacity) return fail("本堂課已滿班");
    if (card.remaining - (held._sum.pointCost ?? 0) < session.pointCost)
      return fail("方案可用點數不足");
    const booking = await tx.courseBooking.create({
      data: {
        ...input,
        storeId,
        pointCost: session.pointCost,
        operatorUserId: actor.userId,
        operatorCustomerId: actor.customerId ?? null,
        operatorName: actor.name,
        customerName: customers[0].name,
      },
    });
    await tx.coursePointEntry.create({
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
  });
}

export async function settleCourseBooking(
  tx: Prisma.TransactionClient,
  actor: CourseActor,
  bookingId: string,
  target: "CANCELLED" | "ATTENDED",
) {
  const booking = await tx.courseBooking.findFirst({
    where: { id: bookingId, storeId: actor.storeId },
    include: { session: true, card: { include: { members: true } } },
  });
  if (!booking) return fail("找不到本店預約");
  if (
    actor.customerId &&
    !booking.card.members.some((m) => m.customerId === actor.customerId)
  )
    return fail("無權操作此共卡預約");
  if (booking.status === target) return booking;
  if (booking.status !== "RESERVED")
    return fail("此預約已結算或取消，不能重複操作");
  if (target === "ATTENDED") {
    if (actor.customerId) return fail("點名僅限有權限的人員");
    if (booking.session.startsAt > new Date())
      return fail("課程尚未開始，不能點名扣點");
    const updated = await tx.coursePointCard.updateMany({
      where: {
        id: booking.cardId,
        storeId: actor.storeId,
        remaining: { gte: booking.pointCost },
      },
      data: { remaining: { decrement: booking.pointCost } },
    });
    if (!updated.count) return fail("點數帳目異常，尚未完成點名");
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
  await tx.coursePointEntry.create({
    data: {
      storeId: actor.storeId,
      cardId: booking.cardId,
      bookingId: booking.id,
      kind: target === "ATTENDED" ? "DEBIT" : "RELEASE",
      points: booking.pointCost,
      actorUserId: actor.userId,
    },
  });
  return updated;
}
