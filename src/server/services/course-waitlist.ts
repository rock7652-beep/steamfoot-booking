import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { FEATURES } from "@/lib/feature-flags";
import { getStoreLimitsByStoreId, hasStoreFeature } from "@/lib/feature-gate";
import { resolveCustomerBookingWindow, type CustomerBookingWindowConfig } from "@/lib/shop-config";
import { AppError } from "@/lib/errors";
import { reserveCourseInTransaction, type CourseActor } from "@/server/services/course-booking";
import type { Prisma } from "../../../generated/course-client";

export type CourseWaitlistSettings = {
  featureAvailable: boolean;
  enabled: boolean;
  defaultLimit: number;
  autoPromoteStopMinutes: number;
};

export type PromotedWaitlistBooking = {
  entryId: string;
  bookingId: string;
  customerId: string;
  customerName: string;
  sessionId: string;
};

const fail = (message: string): never => { throw new AppError("VALIDATION", message); };

export async function getCourseWaitlistSettings(storeId: string): Promise<CourseWaitlistSettings> {
  const featureAvailable = await hasStoreFeature(storeId, FEATURES.COURSE_WAITLIST);
  const row = featureAvailable
    ? await coursePrisma.courseWaitlistSetting.findUnique({ where: { storeId } })
    : null;
  return {
    featureAvailable,
    enabled: featureAvailable && (row?.enabled ?? false),
    defaultLimit: row?.defaultLimit ?? 5,
    autoPromoteStopMinutes: row?.autoPromoteStopMinutes ?? 240,
  };
}

function groupKeyFor(requestKey: string, customerIds: string[]) {
  return createHash("sha256")
    .update(JSON.stringify([requestKey, [...customerIds].sort()]))
    .digest("hex");
}

export function waitlistGroups<T extends { groupKey: string; createdAt: Date; id: string }>(rows: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(row.groupKey) ?? [];
    group.push(row);
    groups.set(row.groupKey, group);
  }
  return [...groups.values()].sort((a, b) =>
    a[0].createdAt.getTime() - b[0].createdAt.getTime() || a[0].id.localeCompare(b[0].id),
  );
}

export function withinAutoPromoteWindow(startsAt: Date, stopMinutes: number, now = new Date()) {
  return startsAt.getTime() > now.getTime() + stopMinutes * 60_000;
}

export async function joinCourseWaitlist(
  actor: CourseActor,
  input: { sessionId: string; cardId: string; customerIds: string[]; requestKey: string },
) {
  const customerIds = [...new Set(input.customerIds)].sort();
  if (!customerIds.length || customerIds.length !== input.customerIds.length || customerIds.length > 20)
    fail("請選擇 1 至 20 位不重複的候補人");

  const settings = await getCourseWaitlistSettings(actor.storeId);
  if (!settings.featureAvailable || !settings.enabled) fail("本店目前未開放候補");

  return coursePrisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`course-waitlist:${actor.storeId}`}))`;

    const [session, card, customers, rule] = await Promise.all([
      tx.courseSession.findFirst({
        where: { id: input.sessionId, storeId: actor.storeId, cancelledAt: null },
        include: { template: true },
      }),
      tx.coursePointCard.findFirst({
        where: { id: input.cardId, storeId: actor.storeId },
        include: { members: true },
      }),
      tx.$queryRaw<Array<{ id: string; name: string }>>`
        SELECT id,name FROM "Customer"
        WHERE "storeId"=${actor.storeId} AND id = ANY(${customerIds}::text[])
          AND "mergedIntoCustomerId" IS NULL
      `,
      tx.courseBookingRule.findUnique({ where: { storeId: actor.storeId } }),
    ]);
    if (!session || !card || customers.length !== customerIds.length)
      fail("請選擇本店有效課程、方案與候補人");
    if (!session.template.waitlistEnabled) fail("本課程未開放候補");
    if (session.releasedAt || !session.template.isActive || session.template.visibility !== "PUBLIC")
      fail("本課程目前不開放候補");
    if (session.startsAt <= new Date()) fail("課程已開始，不能加入候補");
    if (card.closedAt) fail("方案已退款或結清，不能候補");
    if (card.expiresAt < session.startsAt) fail("方案不涵蓋上課日期，不能候補");
    if (card.templateIds.length && !card.templateIds.includes(session.templateId))
      fail("此方案不適用本堂課");
    if (card.termSessionIds.length && !card.termSessionIds.includes(session.id))
      fail("此方案僅能使用指定課次");
    if (!customerIds.every(customerId => card.members.some(member => member.customerId === customerId)))
      fail("僅能替此共卡的授權成員候補");
    if (actor.customerId && !card.members.some(member => member.customerId === actor.customerId))
      fail("無權使用此共卡候補");

    const now = new Date();
    if (session.startsAt.getTime() <= now.getTime() + (rule?.bookingLeadMinutes ?? 0) * 60_000)
      fail("已超過候補截止時間");
    if (actor.customerId) {
      const configs = await tx.$queryRaw<CustomerBookingWindowConfig[]>`
        SELECT "bookableUntilDate","bookingOpensAt","bookingWindowDays"
        FROM "ShopConfig" WHERE "storeId"=${actor.storeId}
      `;
      const window = resolveCustomerBookingWindow(configs[0], now);
      if ((window.opensAt && now < window.opensAt) || session.startsAt > window.closesAt)
        fail("此課程尚未開放會員候補");
    }

    const bookingCost = card.unit === "SESSION" ? 1 : session.pointCost;
    const [occupied, waitingCount, existingBookings, existingWaitlist, held] = await Promise.all([
      tx.courseBooking.count({ where: { storeId: actor.storeId, sessionId: session.id, status: { not: "CANCELLED" } } }),
      tx.courseWaitlistEntry.count({ where: { storeId: actor.storeId, sessionId: session.id, status: "WAITING" } }),
      tx.courseBooking.findMany({
        where: { storeId: actor.storeId, sessionId: session.id, customerId: { in: customerIds }, status: { not: "CANCELLED" } },
        select: { customerId: true },
      }),
      tx.courseWaitlistEntry.findMany({
        where: { storeId: actor.storeId, sessionId: session.id, customerId: { in: customerIds }, status: "WAITING" },
        select: { customerId: true },
      }),
      tx.courseBooking.aggregate({
        where: { storeId: actor.storeId, cardId: card.id, status: "RESERVED" },
        _sum: { pointCost: true },
      }),
    ]);
    if (occupied < session.capacity) fail("本堂課還有名額，請直接預約");
    if (existingBookings.length) fail("選擇的人員中已有本堂正式預約");
    if (existingWaitlist.length) fail("選擇的人員中已有本堂候補");
    const limit = session.template.waitlistLimit || settings.defaultLimit;
    if (waitingCount + customerIds.length > limit) fail("本堂候補名額已滿");
    if (card.remaining - (held._sum.pointCost ?? 0) < bookingCost * customerIds.length)
      fail(card.unit === "SESSION" ? "方案可用堂數不足" : "方案可用點數不足");

    const groupKey = groupKeyFor(input.requestKey, customerIds);
    const people = new Map(customers.map(person => [person.id, person.name]));
    const rows = [];
    for (const customerId of customerIds) {
      const row = await tx.courseWaitlistEntry.create({
        data: {
          id: crypto.randomUUID(),
          storeId: actor.storeId,
          sessionId: session.id,
          cardId: card.id,
          customerId,
          customerName: people.get(customerId) ?? "學員",
          groupKey,
          requestKey: `${input.requestKey}:${customerId}`,
          operatorUserId: actor.userId,
          operatorCustomerId: actor.customerId ?? null,
          operatorName: actor.name,
          pointCost: bookingCost,
        },
      });
      rows.push(row);
    }
    const all = await tx.courseWaitlistEntry.findMany({
      where: { storeId: actor.storeId, sessionId: session.id, status: "WAITING" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, groupKey: true, createdAt: true },
    });
    const groups = waitlistGroups(all);
    return { rows, position: groups.findIndex(group => group.some(row => row.groupKey === groupKey)) + 1 };
  }, { timeout: 15_000 });
}

export async function cancelMemberCourseWaitlist(
  actor: CourseActor,
  input: { sessionId: string },
) {
  if (!actor.customerId) fail("只有會員可以取消自己的候補");
  return coursePrisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`course-waitlist:${actor.storeId}`}))`;
    const own = await tx.courseWaitlistEntry.findFirst({
      where: { storeId: actor.storeId, sessionId: input.sessionId, customerId: actor.customerId, status: "WAITING" },
      select: { groupKey: true },
    });
    if (!own) fail("找不到目前候補紀錄");
    const result = await tx.courseWaitlistEntry.updateMany({
      where: { storeId: actor.storeId, sessionId: input.sessionId, groupKey: own.groupKey, status: "WAITING" },
      data: { status: "CANCELLED", failureReason: "會員取消", updatedAt: new Date() },
    });
    return { count: result.count };
  });
}

export async function cancelCourseWaitlistForSession(
  tx: Prisma.TransactionClient,
  storeId: string,
  sessionId: string,
) {
  await tx.courseWaitlistEntry.updateMany({
    where: { storeId, sessionId, status: "WAITING" },
    data: { status: "CANCELLED", failureReason: "課程取消", updatedAt: new Date() },
  });
}

export async function promoteCourseWaitlistForSession(
  tx: Prisma.TransactionClient,
  storeId: string,
  sessionId: string,
  options: { ignoreCutoff?: boolean } = {},
): Promise<PromotedWaitlistBooking[]> {
  const settings = await getCourseWaitlistSettings(storeId);
  if (!settings.featureAvailable || !settings.enabled) return [];
  const session = await tx.courseSession.findFirst({
    where: { id: sessionId, storeId, cancelledAt: null, releasedAt: null },
    include: { template: true },
  });
  if (!session || !session.template.waitlistEnabled) return [];
  const stopMinutes = session.template.waitlistStopMinutes ?? settings.autoPromoteStopMinutes;
  if (!options.ignoreCutoff && !withinAutoPromoteWindow(session.startsAt, stopMinutes)) return [];

  const occupied = await tx.courseBooking.count({
    where: { storeId, sessionId, status: { not: "CANCELLED" } },
  });
  let freeSeats = Math.max(0, session.capacity - occupied);
  if (!freeSeats) return [];

  const waiting = await tx.courseWaitlistEntry.findMany({
    where: { storeId, sessionId, status: "WAITING" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const groups = waitlistGroups(waiting);
  const promoted: PromotedWaitlistBooking[] = [];
  const limits = await getStoreLimitsByStoreId(storeId);

  for (const group of groups) {
    if (group.length > freeSeats) break;
    await tx.$executeRawUnsafe("SAVEPOINT course_waitlist_group");
    try {
      const groupBookings: Array<{ entry: (typeof group)[number]; booking: { id: string } }> = [];
      for (const entry of group) {
        const booking = await reserveCourseInTransaction(
          tx,
          {
            storeId,
            userId: entry.operatorUserId,
            name: entry.operatorName,
            customerId: entry.operatorCustomerId ?? undefined,
          },
          {
            sessionId,
            cardId: entry.cardId,
            customerId: entry.customerId,
            requestKey: `waitlist-promote:${entry.id}`,
          },
          limits.maxMonthlyBookings,
        );
        groupBookings.push({ entry, booking });
      }
      for (const item of groupBookings) {
        await tx.courseWaitlistEntry.update({
          where: { id: item.entry.id },
          data: { status: "PROMOTED", promotedBookingId: item.booking.id, failureReason: null, updatedAt: new Date() },
        });
        promoted.push({
          entryId: item.entry.id,
          bookingId: item.booking.id,
          customerId: item.entry.customerId,
          customerName: item.entry.customerName,
          sessionId,
        });
      }
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT course_waitlist_group");
      freeSeats -= group.length;
      if (!freeSeats) break;
    } catch (error) {
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT course_waitlist_group");
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT course_waitlist_group");
      const reason = error instanceof Error ? error.message.slice(0, 500) : "遞補資格已變更";
      await tx.courseWaitlistEntry.updateMany({
        where: { storeId, sessionId, groupKey: group[0].groupKey, status: "WAITING" },
        data: { status: "SKIPPED", failureReason: reason, updatedAt: new Date() },
      });
      continue;
    }
  }
  return promoted;
}
