"use server";
import { isMusicOpeningMakeupBooking, MUSIC_OPENING_MAKEUP_OPERATION_ISSUE } from "@/lib/music-opening-runtime";
import { z } from "zod";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { courseAccount, courseManager, courseTransaction } from "@/server/services/course-access";
import { coursePrisma } from "@/lib/course-db";
import { prisma } from "@/lib/db";
import { AppError, handleActionError } from "@/lib/errors";
import { getTrialSettings, clampTrialTotal } from "@/lib/shop-config";
import { getStoreLimitsByStoreId } from "@/lib/feature-gate";
import { changeCompanionUsage } from "@/server/services/course-companions";
import { reserveCourseInTransaction } from "@/server/services/course-booking";
import type { Prisma } from "../../../generated/course-client";

const id = z.string().min(1).max(100);
const scope = z.object({bookingId: id, coach: z.boolean().default(false)});
async function access(coach: boolean) {
  return coach ? courseAccount({write: true}) : courseManager("booking.update");
}
async function authorize(tx: Prisma.TransactionClient, storeId: string, userId: string, bookingId: string, coach: boolean) {
  if (!coach) return;
  const rows = await tx.$queryRaw<Array<{id: string}>>`
    SELECT b.id FROM "CourseBooking" b
    JOIN "CourseSession" s ON s.id=b."sessionId" AND s."storeId"=b."storeId"
    JOIN "StaffMemberLink" l ON l."staffId"=s."coachId" AND l."storeId"=s."storeId"
    JOIN "Staff" st ON st.id=l."staffId" AND st."storeId"=l."storeId"
    WHERE b.id=${bookingId} AND b."storeId"=${storeId} AND l."userId"=${userId}
      AND l."revokedAt" IS NULL AND st.status::text='ACTIVE' AND st."courseCoachEnabled"=true`;
  if (!rows.length) throw new AppError("FORBIDDEN", "只能操作自己授課的同行預約");
}
function refresh() { revalidatePath("/dashboard/courses"); revalidatePath("/book"); }

export async function loadCourseCompanionUsage(input: unknown) {
  try {
    const data = scope.extend({search: z.string().trim().max(100).default("")}).parse(input);
    const {user, storeId} = await access(data.coach);
    await courseTransaction(storeId, tx => authorize(tx, storeId, user.id, data.bookingId, data.coach));
    const booking = await coursePrisma.courseBooking.findFirst({where: {id: data.bookingId, storeId}, include: {card: {select: {nameSnapshot: true}}}});
    if (booking && isMusicOpeningMakeupBooking(booking)) throw new AppError("VALIDATION", MUSIC_OPENING_MAKEUP_OPERATION_ISSUE);
    if (!booking?.companionIndex || booking.status === "CANCELLED") throw new AppError("NOT_FOUND", "找不到同行預約");
    const [customers, settings] = await Promise.all([
      prisma.customer.findMany({where: {storeId, mergedIntoCustomerId: null, ...(data.search ? {OR: [{name: {contains: data.search}}, {phone: {contains: data.search}}]} : booking.customerId ? {id: booking.customerId} : {id: ""})}, select: {id: true, name: true, phone: true}, take: 20, orderBy: {name: "asc"}}),
      getTrialSettings(storeId),
    ]);
    const cards = customers.length ? await coursePrisma.coursePointCard.findMany({where: {storeId, members: {some: {customerId: {in: customers.map(c => c.id)}}}, closedAt: null, expiresAt: {gte: new Date()}, termSessionIds: {isEmpty: true}}, select: {id: true, nameSnapshot: true, members: {select: {customerId: true}}}}) : [];
    return {success: true as const, data: {booking: {id: booking.id, name: booking.customerName, customerId: booking.customerId, cardId: booking.cardId, reserverCardId: booking.reserverCardId, reserverName: booking.reserverName, planName: booking.card?.nameSnapshot ?? "體驗", updatedAt: booking.updatedAt.toISOString()}, customers, cards, trialEnabled: settings.trialEnabled}};
  } catch (error) { return handleActionError(error); }
}

export async function saveCourseCompanionUsage(input: unknown) {
  try {
    const data = scope.extend({mode: z.enum(["RESERVER", "TRIAL", "MEMBER"]), customerId: id.optional(), cardId: id.optional(), expectedUpdatedAt: z.string().datetime(), requestKey: z.string().uuid()}).parse(input);
    const {user, storeId} = await access(data.coach);
    let trialPrice: number | undefined;
    if (data.mode === "TRIAL") {
      if (!data.coach) await courseManager("trial.create");
      const settings = await getTrialSettings(storeId);
      if (!settings.trialEnabled) throw new AppError("FORBIDDEN", "店家體驗功能已關閉");
      trialPrice = clampTrialTotal(undefined, 1, settings);
    }
    const receipt = await courseTransaction(storeId, async tx => {
      await authorize(tx, storeId, user.id, data.bookingId, data.coach);
      const before = await tx.courseBooking.findFirstOrThrow({where: {id: data.bookingId, storeId}, select: {cardId: true, pointCost: true}});
      const updated = await changeCompanionUsage(tx, {storeId, userId: user.id, name: user.name ?? "教練"}, {...data, trialPrice});
      const cards = await tx.coursePointCard.findMany({where: {storeId, id: {in: [before.cardId, updated.cardId].filter((id): id is string => !!id)}}, include: {bookings: {where: {status: "RESERVED"}, select: {pointCost: true}}}});
      const balances = cards.map(card => ({id: card.id, available: card.closedAt || card.musicOpeningStateRequired || card.expiresAt === null || card.expiresAt < new Date() ? 0 : Math.max(0, card.remaining - card.bookings.reduce((sum, b) => sum + b.pointCost, 0))}));
      const card = cards.find(card => card.id === updated.cardId);
      return {booking: {id: updated.id, cardId: updated.cardId, customerId: updated.customerId, customerName: updated.customerName, updatedAt: updated.updatedAt.toISOString(), cost: updated.pointCost, unit: card?.unit ?? "TRIAL", planName: card?.nameSnapshot ?? "體驗（不使用方案）", available: balances.find(b => b.id === updated.cardId)?.available ?? null, expiresAt: card?.expiresAt?.toISOString() ?? null}, balances,
        returned: before.cardId && before.cardId !== updated.cardId ? {amount: before.pointCost, unit: cards.find(card => card.id === before.cardId)?.unit ?? "POINT"} : null, confirmedAt: Date.now()};
    });
    after(() => refresh());
    return {success: true as const, receipt};
  } catch (error) { return handleActionError(error); }
}

export async function addCourseCompanion(input: unknown) {
  try {
    const data = scope.extend({name: z.string().trim().max(100).default(""), requestKey: z.string().uuid()}).parse(input);
    const {user, storeId} = await access(data.coach);
    if (!data.coach) await courseManager("booking.create");
    const limits = await getStoreLimitsByStoreId(storeId);
    await courseTransaction(storeId, async tx => {
      await authorize(tx, storeId, user.id, data.bookingId, data.coach);
      const source = await tx.courseBooking.findFirst({where: {id: data.bookingId, storeId, status: {not: "CANCELLED"}}, include: {card: {include: {plan: true}}, session: true}});
      if (source && isMusicOpeningMakeupBooking(source)) throw new AppError("VALIDATION", MUSIC_OPENING_MAKEUP_OPERATION_ISSUE);
      if (!source?.customerId || source.companionIndex || !source.cardId || source.card?.termSessionIds.length || source.session.endsAt <= new Date()) throw new AppError("VALIDATION", "此預約無法新增同行");
      const previous = await tx.courseBooking.findUnique({where: {storeId_requestKey: {storeId, requestKey: `onsite-companion:${data.requestKey}`}}});
      if (previous) {
        if (isMusicOpeningMakeupBooking(previous)) throw new AppError("VALIDATION", MUSIC_OPENING_MAKEUP_OPERATION_ISSUE);
        if (previous.operatorUserId !== user.id || previous.reserverCustomerId !== source.customerId || previous.sessionId !== source.sessionId || previous.cardId !== source.cardId || previous.customerName !== (data.name || `同行者 ${previous.companionIndex}`)) throw new AppError("CONFLICT", "操作請求已使用");
        return previous;
      }
      const groupKey = source.groupKey ?? `onsite:${source.id}`;
      const companions = await tx.courseBooking.findMany({where: {storeId, sessionId: source.sessionId, groupKey, companionIndex: {not: null}, status: {not: "CANCELLED"}}, select: {companionIndex: true}});
      const index = [1, 2].find(i => !companions.some(b => b.companionIndex === i));
      if (!index) throw new AppError("VALIDATION", "本次預約最多 3 人");
      await tx.courseBooking.update({where: {id: source.id}, data: {groupKey}});
      return reserveCourseInTransaction(tx, {storeId, userId: user.id, name: user.name ?? "教練"}, {
        sessionId: source.sessionId, cardId: source.cardId, customerId: null, customerName: data.name || `同行者 ${index}`, companionIndex: index,
        reserverCustomerId: source.customerId, reserverName: source.customerName, reserverCardId: source.cardId, groupKey,
        requestKey: `onsite-companion:${data.requestKey}`, onSite: true,
      }, limits.maxMonthlyBookings);
    });
    refresh();
    return {success: true as const};
  } catch (error) { return handleActionError(error); }
}
