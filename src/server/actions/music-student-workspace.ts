"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { AppError, handleActionError } from "@/lib/errors";
import { checkPermission } from "@/lib/permissions";
import { getManagerCustomerWhere } from "@/lib/manager-visibility";
import { courseManagerRead } from "@/server/services/course-access";
import { getCourseCards } from "@/server/queries/course-members";
import { getOpeningMakeupWorkspace } from "@/server/queries/music-opening-makeup";
import { readMusicPilotTuition, PILOT_EVIDENCE_ID } from "@/server/services/music-pilot-policy";

/** One learner only; each section keeps its own existing permission boundary. */
export async function loadMusicStudentWorkspace(input: unknown) {
  try {
    const customerId = z.string().min(1).max(200).parse(input);
    const { user, storeId } = await courseManagerRead("customer.read");
    const customer = await prisma.customer.findFirst({
      where: { ...getManagerCustomerWhere(user.role, user.staffId, storeId), storeId, id: customerId, mergedIntoCustomerId: null },
      select: { id: true },
    });
    if (!customer || !await prisma.storeFeatureEntitlement.findFirst({ where: { storeId, featureKey: "business.music", status: "ENABLED" }, select: { storeId: true } }))
      throw new AppError("NOT_FOUND", "找不到本店學員");
    const [canReadCards, canReadBookings, canReadTransactions] = await Promise.all([
      checkPermission(user.role, user.staffId, "wallet.read"),
      checkPermission(user.role, user.staffId, "booking.read"),
      checkPermission(user.role, user.staffId, "transaction.read"),
    ]);
    const [cards, next, opening, makeupCards, sourceExists] = await Promise.all([
      canReadCards ? getCourseCards(storeId, customerId, { where: { closedAt: null, unit: "SESSION" }, skip: 0, take: 1001, entries: false }) : null,
      canReadBookings ? coursePrisma.courseBooking.findFirst({ where: { storeId, customerId, status: "RESERVED", session: { cancelledAt: null, endsAt: { gt: new Date() } } }, orderBy: { session: { startsAt: "asc" } }, select: { sessionId: true, session: { select: { startsAt: true, nameSnapshot: true } } } }) : null,
      canReadBookings ? getOpeningMakeupWorkspace(storeId, customerId) : null,
      canReadCards ? coursePrisma.coursePointCard.findMany({ where: { storeId, members: { some: { customerId } }, requestKey: { startsWith: "yjy-pilot-makeup:" } }, select: { id: true } }) : [],
      canReadTransactions && customerId.startsWith("yjy-lubymusic-student-")
        ? coursePrisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM "MusicSourceImportBatch" WHERE id=${PILOT_EVIDENCE_ID} AND "storeId"=${storeId}` : [],
    ]);
    if (cards && cards.length > 1000) throw new AppError("VALIDATION", "學費方案較多，請從學費方案分頁查詢");
    const makeupIds = new Set(makeupCards.map(card => card.id));
    const active = cards?.filter(card => !card.expired && !card.closed) ?? [];
    const ordinary = active.filter(card => !makeupIds.has(card.id));
    const separateMakeups = active.filter(card => makeupIds.has(card.id));
    const tuition = sourceExists.length ? (await readMusicPilotTuition(coursePrisma, storeId)).find(row => row.customerId === customerId) ?? null : null;
    return { success: true as const, data: {
      balance: canReadCards ? {
        remaining: ordinary.reduce((sum, card) => sum + card.remaining, 0),
        held: ordinary.reduce((sum, card) => sum + card.held, 0),
        available: ordinary.reduce((sum, card) => sum + card.available, 0),
        issues: ordinary.filter(card => card.openingIssue).length,
        makeupRemaining: separateMakeups.reduce((sum, card) => sum + card.remaining, 0),
      } : null,
      next: next ? { id: next.sessionId, date: next.session.startsAt.toISOString(), name: next.session.nameSnapshot } : null,
      canReadBookings, tuition, opening,
    } };
  } catch (error) {
    const result = handleActionError(error);
    return { success: false as const, error: result.success ? "讀取失敗，請重試" : result.error };
  }
}
