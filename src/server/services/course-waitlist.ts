import { enqueueOperationAudit } from "./operation-audit-outbox";
import "server-only";

import { createHash } from "node:crypto";
import { coursePrisma } from "@/lib/course-db";
import { FEATURES } from "@/lib/feature-flags";
import { getStoreLimitsByStoreId, hasStoreFeature } from "@/lib/feature-gate";
import { resolveCustomerBookingWindow, type CustomerBookingWindowConfig } from "@/lib/shop-config";
import { AppError } from "@/lib/errors";
import { reserveCourseInTransaction, type CourseActor } from "@/server/services/course-booking";
import { lockCourseStore } from "@/server/services/course-store-lock";
import { Prisma } from "../../../generated/course-client";
import { waitlistGroups, withinAutoPromoteWindow } from "@/lib/course-waitlist";

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

export async function getCourseWaitlistSettings(storeId: string, reader: Pick<Prisma.TransactionClient, "courseWaitlistSetting"> = coursePrisma): Promise<CourseWaitlistSettings> {
  const featureAvailable = await hasStoreFeature(storeId, FEATURES.COURSE_WAITLIST);
  const row = featureAvailable
    ? await reader.courseWaitlistSetting.findUnique({ where: { storeId } })
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

export async function joinCourseWaitlist(
  actor: CourseActor,
  input: { sessionId: string; cardId: string; customerIds: string[]; companionNames?: string[]; requestKey: string },
) {
  const customerIds = [...new Set(input.customerIds)].sort();
  if (!customerIds.length || customerIds.length !== input.customerIds.length || customerIds.length > 20)
    fail("請選擇 1 至 20 位不重複的候補人");

  const companionNames = input.companionNames ?? [];
  if (companionNames.length && (!actor.customerId || customerIds.length !== 1 || customerIds[0] !== actor.customerId || companionNames.length > 2)) fail("同行候補須包含本人，最多 3 人");
  const participantCount = customerIds.length + companionNames.length;
  const settings = await getCourseWaitlistSettings(actor.storeId);
  if (!settings.featureAvailable || !settings.enabled) fail("本店目前未開放候補");

  return coursePrisma.$transaction(async tx => {
    await lockCourseStore(tx, actor.storeId);

    const replayGroup = groupKeyFor(input.requestKey, [...customerIds, ...companionNames.map((name, i) => `companion:${i + 1}:${name}`)]);
    const previous = await tx.courseWaitlistEntry.findMany({where: {storeId: actor.storeId, requestKey: {startsWith: `${input.requestKey}:`}}});
    if (previous.length) {
      if (previous.length !== participantCount || previous.some(row => row.groupKey !== replayGroup || row.sessionId !== input.sessionId || row.cardId !== input.cardId || row.operatorUserId !== actor.userId)) fail("候補請求已使用，請重新開啟");
      const waiting = await tx.courseWaitlistEntry.findMany({where: {storeId: actor.storeId, sessionId: input.sessionId, status: "WAITING"}, orderBy: [{createdAt: "asc"}, {id: "asc"}]});
      return {rows: previous, position: waitlistGroups(waiting).findIndex(group => group[0].groupKey === replayGroup) + 1};
    }
    const [session, card, customers, rule] = await Promise.all([
      tx.courseSession.findFirst({
        where: { id: input.sessionId, storeId: actor.storeId, cancelledAt: null },
        include: { template: true },
      }),
      tx.coursePointCard.findFirst({
        where: { id: input.cardId, storeId: actor.storeId },
        include: { members: true, plan: {select: {allowShared: true}} },
      }),
      tx.$queryRaw<Array<{ id: string; name: string }>>`
        SELECT id,name FROM "Customer"
        WHERE "storeId"=${actor.storeId} AND id IN (${Prisma.join(customerIds)})
          AND "mergedIntoCustomerId" IS NULL
      `,
      tx.courseBookingRule.findUnique({ where: { storeId: actor.storeId } }),
    ]);
    if (!session) fail("找不到本店有效課程");
    if (!card) fail("找不到本店有效方案");
    const activeSession = session!;
    const activeCard = card!;
    if (customers.length !== customerIds.length) fail("請選擇本店有效候補人");
    if (!activeSession.template.waitlistEnabled) fail("本課程未開放候補");
    if (activeSession.releasedAt || !activeSession.template.isActive || activeSession.template.visibility !== "PUBLIC")
      fail("本課程目前不開放候補");
    if (activeSession.startsAt <= new Date()) fail("課程已開始，不能加入候補");
    if (activeCard.closedAt) fail("方案已退款或結清，不能候補");
    if (activeCard.expiresAt < activeSession.startsAt) fail("方案不涵蓋上課日期，不能候補");
    if (activeCard.templateIds.length && !activeCard.templateIds.includes(activeSession.templateId))
      fail("此方案不適用本堂課");
    if (activeCard.termSessionIds.length && !activeCard.termSessionIds.includes(activeSession.id))
      fail("此方案僅能使用指定課次");
    if (!customerIds.every(customerId => activeCard.members.some(member => member.customerId === customerId)))
      fail("僅能替此共卡的授權成員候補");
    if (actor.customerId && !activeCard.members.some(member => member.customerId === actor.customerId))
      fail("無權使用此共卡候補");

    if (companionNames.length) {
      const music = await tx.$queryRaw<Array<{featureKey:string}>>`SELECT "featureKey" FROM "StoreFeatureEntitlement" WHERE "storeId"=${actor.storeId} AND "featureKey"='business.music' AND status::text='ENABLED' LIMIT 1`;
      if (music.length || activeCard.termSessionIds.length || !activeCard.plan.allowShared) fail("此方案未開放自由選課同行候補");
    }
    const now = new Date();
    if (activeSession.startsAt.getTime() <= now.getTime() + (rule?.bookingLeadMinutes ?? 0) * 60_000)
      fail("已超過候補截止時間");
    if (actor.customerId) {
      const configs = await tx.$queryRaw<CustomerBookingWindowConfig[]>`
        SELECT "bookableUntilDate","bookingOpensAt","bookingWindowDays"
        FROM "ShopConfig" WHERE "storeId"=${actor.storeId}
      `;
      const window = resolveCustomerBookingWindow(configs[0], now);
      if ((window.opensAt && now < window.opensAt) || activeSession.startsAt > window.closesAt)
        fail("此課程尚未開放會員候補");
    }

    const bookingCost = activeCard.unit === "SESSION" ? 1 : activeSession.pointCost;
    const [occupied, waitingCount, existingBookings, existingWaitlist, held] = await Promise.all([
      tx.courseBooking.count({ where: { storeId: actor.storeId, sessionId: activeSession.id, status: { not: "CANCELLED" } } }),
      tx.courseWaitlistEntry.count({ where: { storeId: actor.storeId, sessionId: activeSession.id, status: "WAITING" } }),
      tx.courseBooking.findMany({
        where: { storeId: actor.storeId, sessionId: activeSession.id, customerId: { in: customerIds }, status: { not: "CANCELLED" } },
        select: { customerId: true },
      }),
      tx.courseWaitlistEntry.findMany({
        where: { storeId: actor.storeId, sessionId: activeSession.id, customerId: { in: customerIds }, status: "WAITING" },
        select: { customerId: true },
      }),
      tx.courseBooking.aggregate({
        where: { storeId: actor.storeId, cardId: activeCard.id, status: "RESERVED" },
        _sum: { pointCost: true },
      }),
    ]);
    if (occupied + participantCount <= activeSession.capacity) fail("本堂課還有名額，請直接預約");
    if (existingBookings.length) fail("選擇的人員中已有本堂正式預約");
    if (existingWaitlist.length) fail("選擇的人員中已有本堂候補");
    const limit = activeSession.template.waitlistLimit || settings.defaultLimit;
    if (waitingCount + participantCount > limit) fail("本堂候補名額已滿");
    if (activeCard.remaining - (held._sum.pointCost ?? 0) < bookingCost * participantCount)
      fail(activeCard.unit === "SESSION" ? "方案可用堂數不足" : "方案可用點數不足");

    const groupKey = groupKeyFor(input.requestKey, [...customerIds, ...companionNames.map((name, i) => `companion:${i + 1}:${name}`)]);
    const people = new Map(customers.map(person => [person.id, person.name]));
    const rows = [];
    for (const customerId of customerIds) {
      const row = await tx.courseWaitlistEntry.create({
        data: {
          id: crypto.randomUUID(),
          storeId: actor.storeId,
          sessionId: activeSession.id,
          cardId: activeCard.id,
          customerId,
          customerName: people.get(customerId) ?? "學員",
          reserverCustomerId: actor.customerId, reserverCardId: activeCard.id,
          reserverName: actor.name,
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
    for (const [index, name] of companionNames.entries()) {
      rows.push(await tx.courseWaitlistEntry.create({data: {
        id: crypto.randomUUID(), storeId: actor.storeId, sessionId: activeSession.id, cardId: activeCard.id,
        customerId: null, customerName: name.trim() || `同行者 ${index + 1}`, companionIndex: index + 1,
        reserverCustomerId: actor.customerId, reserverCardId: activeCard.id, reserverName: actor.name, groupKey,
        requestKey: `${input.requestKey}:companion:${index + 1}`, operatorUserId: actor.userId,
        operatorCustomerId: actor.customerId, operatorName: actor.name, pointCost: bookingCost,
      }}));
    }
    const all = await tx.courseWaitlistEntry.findMany({
      where: { storeId: actor.storeId, sessionId: activeSession.id, status: "WAITING" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, groupKey: true, createdAt: true },
    });
    const groups = waitlistGroups(all);
    await enqueueOperationAudit({ actorUserId: actor.userId, actorNameSnapshot: actor.name, storeId: actor.storeId, module: "COURSE", targetType: "CourseWaitlist", targetId: groupKey, action: "JOIN", summary: `加入課程候補（${rows.length} 人）`, after: { sessionId: input.sessionId, count: rows.length } }, tx, input.requestKey);
    return { rows, position: groups.findIndex(group => group.some(row => row.groupKey === groupKey)) + 1 };
  }, { timeout: 15_000 });
}

export async function cancelMemberCourseWaitlist(
  actor: CourseActor,
  input: { sessionId: string },
) {
  if (!actor.customerId) fail("只有會員可以取消自己的候補");
  return coursePrisma.$transaction(async tx => {
    await lockCourseStore(tx, actor.storeId);
    const own = await tx.courseWaitlistEntry.findFirst({
      where: { storeId: actor.storeId, sessionId: input.sessionId, customerId: actor.customerId, status: "WAITING" },
      select: { groupKey: true },
    });
    if (!own) fail("找不到目前候補紀錄");
    const groupKey = own!.groupKey;
    const result = await tx.courseWaitlistEntry.updateMany({
      where: { storeId: actor.storeId, sessionId: input.sessionId, groupKey, status: "WAITING" },
      data: { status: "CANCELLED", failureReason: "會員取消", updatedAt: new Date() },
    });
    await enqueueOperationAudit({ actorUserId: actor.userId, actorNameSnapshot: actor.name, storeId: actor.storeId, module: "COURSE", targetType: "CourseWaitlist", targetId: groupKey, action: "CANCEL", summary: `取消課程候補（${result.count} 人）` }, tx);
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
  const settings = await getCourseWaitlistSettings(storeId, tx);
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
            customerName: entry.customerName,
            companionIndex: entry.companionIndex ?? undefined,
            reserverCustomerId: entry.reserverCustomerId ?? undefined,
            reserverName: entry.reserverName ?? undefined,
            reserverCardId: entry.reserverCardId ?? undefined,
            groupKey: entry.groupKey,
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
          customerId: item.entry.reserverCustomerId ?? item.entry.operatorCustomerId ?? item.entry.customerId!,
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
