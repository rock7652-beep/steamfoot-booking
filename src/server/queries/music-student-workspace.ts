import {measureMusicRead} from "@/lib/music-read-timing";
import "server-only";
import {musicNativeWorkflowEnabled} from "@/server/services/music-native-workflow";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { AppError, handleActionError } from "@/lib/errors";
import { checkPermission } from "@/lib/permissions";
import { getManagerCustomerWhere } from "@/lib/manager-visibility";
import { courseManagerRead } from "@/server/services/course-access";
import { getCourseCards } from "@/server/queries/course-members";

/** One learner only; each section keeps its own existing permission boundary. */
export async function readMusicStudentWorkspace(input: unknown, previewOnly = false, timings?: Record<string, number>, tuitionInput: unknown = true) {
  const measure = async <T>(name: string, work: () => Promise<T>): Promise<T> => { const start = performance.now(); try { return await measureMusicRead(name,work); } finally { if (timings) timings[name] = Math.round(performance.now() - start); } };
  try {
    z.boolean().parse(tuitionInput);
    const customerId = z.string().min(1).max(200).parse(input);
    const { user, storeId } = await measure("authorization", () => courseManagerRead("customer.read", {reuseVerifiedStore: previewOnly}))
    if (previewOnly && !musicNativeWorkflowEnabled(storeId)) throw new AppError("FORBIDDEN", "音樂功能未開通");
    const [customer, musicEnabled] = await measure("customer", () => Promise.all([prisma.customer.findFirst({
      where: { ...getManagerCustomerWhere(user.role, user.staffId, storeId), storeId, id: customerId, mergedIntoCustomerId: null },
      select: { id: true },
    }), prisma.storeFeatureEntitlement.findFirst({ where: { storeId, featureKey: "business.music", status: "ENABLED" }, select: { storeId: true } })]));
    if (!customer || !musicEnabled)
      throw new AppError("NOT_FOUND", "找不到本店學員");
    const [canReadCards, canReadBookings] = await Promise.all([
      checkPermission(user.role, user.staffId, "wallet.read"),
      checkPermission(user.role, user.staffId, "booking.read"),
    ]);
    const [cards, next, makeupCards] = await measure("sections", () => Promise.all([
      canReadCards ? measure("cards",()=>getCourseCards(storeId, customerId, { where: { closedAt: null, unit: "SESSION" }, skip: 0, take: 1001, entries: false })) : null,
      canReadBookings ? coursePrisma.courseBooking.findFirst({ where: { storeId, customerId, status: "RESERVED", session: { cancelledAt: null, endsAt: { gt: new Date() } } }, orderBy: { session: { startsAt: "asc" } }, select: { sessionId: true, session: { select: { startsAt: true, nameSnapshot: true } } } }) : null,
      canReadCards ? coursePrisma.coursePointCard.findMany({ where: { storeId, members: { some: { customerId } }, OR: [{ requestKey: { startsWith: "yjy-pilot-makeup:" } }, { requestKey: { startsWith: "music-leave-makeup:" } }] }, select: { id: true } }) : [],
    ]));
    if (cards && cards.length > 1000) throw new AppError("VALIDATION", "學費方案較多，請從學費方案分頁查詢");
    const makeupIds = new Set(makeupCards.map(card => card.id));
    const active = cards?.filter(card => !card.expired && !card.closed) ?? [];
    const ordinary = active.filter(card => !makeupIds.has(card.id));
    const separateMakeups = active.filter(card => makeupIds.has(card.id));
    return { success: true as const, data: {
      balance: canReadCards ? {
        remaining: ordinary.reduce((sum, card) => sum + card.remaining, 0),
        held: ordinary.reduce((sum, card) => sum + card.held, 0),
        available: ordinary.reduce((sum, card) => sum + card.available, 0),
        issues: ordinary.filter(card => card.openingIssue).length,
        makeupRemaining: separateMakeups.reduce((sum, card) => sum + card.remaining, 0),
      } : null,
      next: next ? { id: next.sessionId, date: next.session.startsAt.toISOString(), name: next.session.nameSnapshot } : null,
      canReadBookings, tuition: null, opening: null,
    } };
  } catch (error) {
    const result = handleActionError(error);
    return { success: false as const, error: result.success ? "讀取失敗，請重試" : result.error };
  }
}
