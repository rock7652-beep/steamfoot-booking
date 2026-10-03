import "server-only";
import { isDeepStrictEqual } from "node:util";
import { AppError } from "@/lib/errors";
import type { Prisma } from "../../../generated/course-client";
import type { CourseActor } from "./course-booking";

export type CompanionUsageInput = {
  bookingId: string;
  mode: "RESERVER" | "TRIAL" | "MEMBER";
  customerId?: string;
  cardId?: string;
  trialPrice?: number;
  expectedUpdatedAt: string;
  requestKey: string;
};
const fail = (message: string): never => { throw new AppError("VALIDATION", message); };

/** Caller authorizes the manager / assigned coach and holds the course store lock. */
export async function changeCompanionUsage(tx: Prisma.TransactionClient, actor: CourseActor, input: CompanionUsageInput) {
  const auditId = `course-companion:${input.requestKey}`;
  const replay = await tx.$queryRaw<Array<{actorUserId: string; targetId: string; afterJson: {input?: CompanionUsageInput}}>>`
    SELECT "actorUserId", "targetId", "afterJson" FROM "AuditLog" WHERE id=${auditId}`;
  if (replay.length) {
    if (replay[0].actorUserId !== actor.userId || replay[0].targetId !== input.bookingId || !isDeepStrictEqual(replay[0].afterJson.input, JSON.parse(JSON.stringify(input))))
      return fail("操作請求已使用，請重新開啟");
    return tx.courseBooking.findFirstOrThrow({where: {id: input.bookingId, storeId: actor.storeId}});
  }
  const booking = await tx.courseBooking.findFirst({where: {id: input.bookingId, storeId: actor.storeId}, include: {session: true, card: true, trialPayments: {where: {status: "SUCCESS"}}}});
  if (!booking?.companionIndex || !booking.reserverCustomerId || !booking.reserverCardId || booking.status === "CANCELLED" || booking.session.cancelledAt)
    return fail("找不到可變更的同行預約");
  if (booking.updatedAt.toISOString() !== input.expectedUpdatedAt) return fail("預約已更新，請重新確認");
  const music = await tx.$queryRaw<Array<{featureKey: string}>>`SELECT "featureKey" FROM "StoreFeatureEntitlement" WHERE "storeId"=${actor.storeId} AND "featureKey"='business.music' AND status::text='ENABLED' LIMIT 1`;
  if (music.length || booking.card?.termSessionIds.length) return fail("僅適用運動自由選課同行預約");
  const customerId = input.customerId ?? booking.customerId;
  const customers = customerId ? await tx.$queryRaw<Array<{id: string; name: string}>>`SELECT id,name FROM "Customer" WHERE id=${customerId} AND "storeId"=${actor.storeId} AND "mergedIntoCustomerId" IS NULL` : [];
  if (customerId && !customers.length) return fail("請選擇本店有效學員");
  if (customerId && await tx.courseBooking.findFirst({where: {storeId: actor.storeId, sessionId: booking.sessionId, customerId, id: {not: booking.id}, status: {not: "CANCELLED"}}}))
    return fail("此學員已有本堂預約，請先處理重複紀錄");
  const cardId = input.mode === "TRIAL" ? null : input.mode === "RESERVER" ? booking.reserverCardId : input.cardId;
  if (input.mode === "MEMBER" && (!customerId || !cardId)) return fail("請選擇學員與本人方案");
  const card = cardId ? await tx.coursePointCard.findFirst({where: {id: cardId, storeId: actor.storeId}, include: {members: true, plan: {select: {allowShared: true}}}}) : null;
  if (input.mode !== "TRIAL") {
    if (!card || card.closedAt || card.expiresAt < new Date() || card.expiresAt < booking.session.startsAt || card.termSessionIds.length || (card.templateIds.length && !card.templateIds.includes(booking.session.templateId)))
      return fail("此方案無法使用本堂課");
    if (input.mode === "RESERVER" ? !card.plan.allowShared || !card.members.some(m => m.customerId === booking.reserverCustomerId) : !card.members.some(m => m.customerId === customerId))
      return fail("無權使用此方案");
  }
  const pointCost = card ? card.unit === "SESSION" ? 1 : booking.session.pointCost : 0;
  const trialPrice = input.mode === "TRIAL" ? input.trialPrice ?? 0 : null;
  if (trialPrice !== null && (!Number.isSafeInteger(trialPrice) || trialPrice < 0 || trialPrice > 1000000)) return fail("體驗金額不正確");
  if (booking.trialPayments.length && (cardId !== booking.cardId || trialPrice !== booking.trialPrice)) return fail("體驗已收款，請先處理原收款");
  const debited = booking.status === "ATTENDED" || booking.status === "NO_SHOW";
  if (card && (booking.cardId !== card.id || booking.pointCost !== pointCost)) {
    const held = await tx.courseBooking.aggregate({where: {storeId: actor.storeId, cardId: card.id, status: "RESERVED", id: {not: booking.id}}, _sum: {pointCost: true}});
    const available = card.remaining + (debited && booking.cardId === card.id ? booking.pointCost : 0) - (held._sum.pointCost ?? 0);
    if (available < pointCost) return fail("方案可用額度不足");
  }
  const changedCard = booking.cardId !== cardId || booking.pointCost !== pointCost;
  if (changedCard && booking.status === "NO_SHOW") {
    const coupon = await tx.coursePointCard.findUnique({where: {storeId_requestKey: {storeId: actor.storeId, requestKey: `no-show-makeup:${booking.id}`}}});
    if (coupon && !coupon.closedAt) {
      const used = await tx.courseBooking.count({where: {storeId: actor.storeId, cardId: coupon.id, status: {not: "CANCELLED"}}});
      if (used || coupon.remaining < booking.pointCost) return fail("補課券已使用，請先處理補課再變更使用方式");
      await tx.coursePointCard.update({where: {id: coupon.id}, data: {remaining: 0, closedAt: new Date()}});
      await tx.coursePointEntry.create({data: {storeId: actor.storeId, cardId: coupon.id, actorUserId: actor.userId, kind: "VOID", points: coupon.remaining}});
    }
  }
  if (changedCard && booking.cardId) {
    if (booking.card?.closedAt) return fail("原方案已結清，請先核對額度");
    if (debited) await tx.coursePointCard.update({where: {id: booking.cardId}, data: {remaining: {increment: booking.pointCost}}});
    await tx.coursePointEntry.create({data: {storeId: actor.storeId, cardId: booking.cardId, bookingId: booking.id, actorUserId: actor.userId, kind: `${debited ? "REFUND" : "RELEASE"}:USAGE:${input.requestKey}`, points: booking.pointCost}});
  }
  if (changedCard && card) {
    if (debited) {
      const result = await tx.coursePointCard.updateMany({where: {id: card.id, storeId: actor.storeId, remaining: {gte: pointCost}}, data: {remaining: {decrement: pointCost}}});
      if (!result.count) return fail("方案額度已變更，請重新確認");
    }
    await tx.coursePointEntry.create({data: {storeId: actor.storeId, cardId: card.id, bookingId: booking.id, actorUserId: actor.userId, kind: `${debited ? "DEBIT" : "RESERVE"}:USAGE:${input.requestKey}`, points: pointCost}});
  }
  const updated = await tx.courseBooking.update({where: {id: booking.id}, data: {cardId, bookingKind: card ? "CARD" : "TRIAL", trialPrice, pointCost, customerId, customerName: customers[0]?.name ?? booking.customerName}});
  await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","actorNameSnapshot","storeId",module,"targetType","targetId",action,summary,"beforeJson","afterJson","createdAt") VALUES (${auditId},${actor.userId},${actor.name},${actor.storeId},'COURSE','CourseBooking',${booking.id},'CHANGE_COMPANION_USAGE','變更同行使用方式',${JSON.stringify({cardId: booking.cardId, customerId: booking.customerId, status: booking.status, pointCost: booking.pointCost})}::jsonb,${JSON.stringify({input, cardId, customerId, pointCost, returnedPoints: changedCard && debited ? booking.pointCost : 0})}::jsonb,NOW())`;
  return updated;
}
