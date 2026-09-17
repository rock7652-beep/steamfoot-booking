import "server-only";
import type { Prisma } from "../../../generated/course-client";
import { AppError } from "@/lib/errors";
import { toLocalDateStr } from "@/lib/date-utils";

/** Caller authorizes transaction.refund and holds the course store lock. */
export async function refundUnusedCoursePurchase(
  tx: Prisma.TransactionClient,
  actor: { storeId: string; userId: string },
  input: { purchaseId: string; reason: string; requestKey: string },
) {
  const { storeId, userId } = actor;
  const previous = await tx.coursePurchaseRefund.findUnique({
    where: { storeId_requestKey: { storeId, requestKey: input.requestKey } },
  });
  if (previous) {
    if (previous.purchaseId !== input.purchaseId || previous.reason !== input.reason)
      throw new AppError("CONFLICT", "退款請求已使用，請重新確認");
    return previous;
  }
  const order = await tx.coursePurchase.findFirst({
    where: { id: input.purchaseId, storeId }, include: { refunds: true },
  });
  if (!order) throw new AppError("NOT_FOUND", "找不到本店購買紀錄");
  if (order.refunds.length || order.status === "REFUNDED")
    throw new AppError("BUSINESS_RULE", "此購買已退款，請查看原退款紀錄");
  if (order.status !== "CONFIRMED" || !order.cardId || order.price <= 0)
    throw new AppError("BUSINESS_RULE", "僅可退回已核帳購買的實付金額");
  const card = await tx.coursePointCard.findFirst({
    where: { id: order.cardId, storeId }, include: { entries: true },
  });
  if (!card || card.closedAt) throw new AppError("BUSINESS_RULE", "方案已結清或資料不完整");
  const reserved = await tx.courseBooking.count({ where: { storeId, cardId: card.id, status: "RESERVED" } });
  if (reserved) throw new AppError("BUSINESS_RULE", "此方案仍有未完成預約，請先取消預約後再退款。");
  const attended = await tx.courseBooking.count({ where: { storeId, cardId: card.id, status: "ATTENDED" } });
  if (attended || card.remaining !== order.points)
    throw new AppError("BUSINESS_RULE", "此方案已有使用或額度調整，部分使用退款規則尚待確認，不能全額退款。");
  const grants = card.entries.filter((entry) => entry.kind === "GRANT");
  if (grants.length !== 1 || grants[0].points !== order.points || card.entries.some((entry) => entry.kind === "REFUND"))
    throw new AppError("BUSINESS_RULE", "方案有贈送、調整或退款異動，請先核對來源。");
  // Verify the original accounting entry, rather than refunding a stale price alone.
  const receipts = await tx.$queryRaw<Array<{ amount: unknown; type: string; paymentMethod: string }>>`
    SELECT amount,type::text,"paymentMethod"::text FROM "CashbookEntry"
    WHERE id=${"course-purchase:" + order.id} AND "storeId"=${storeId} FOR UPDATE`;
  const receipt = receipts[0];
  if (!receipt || Number(receipt.amount) !== order.price || receipt.type !== "INCOME" || receipt.paymentMethod !== "OTHER")
    throw new AppError("BUSINESS_RULE", "原收款紀錄不一致，請先核對帳務，尚未退款。");
  const refund = await tx.coursePurchaseRefund.create({ data: {
    storeId, purchaseId: order.id, amount: order.price, points: card.remaining,
    reason: input.reason, actorUserId: userId, requestKey: input.requestKey,
  } });
  await tx.coursePointCard.update({ where: { id: card.id }, data: { remaining: 0, closedAt: new Date() } });
  await tx.coursePointEntry.create({ data: { storeId, cardId: card.id, kind: "REFUND", points: card.remaining, actorUserId: userId } });
  await tx.coursePurchase.update({ where: { id: order.id }, data: { status: "REFUNDED" } });
  await tx.$executeRaw`INSERT INTO "CashbookEntry" (id,"storeId","entryDate",type,"paymentMethod",category,amount,note,"createdByUserId","updatedAt") VALUES (${"course-refund:" + refund.id},${storeId},${new Date(toLocalDateStr() + "T00:00:00Z")},'EXPENSE','OTHER','課程退款',${refund.amount},${"方案退款：" + order.name + " / " + input.reason},${userId},NOW())`;
  const before = JSON.stringify({ storeId, purchaseId: order.id, status: order.status, remaining: card.remaining });
  const after = JSON.stringify({ storeId, purchaseId: order.id, refundId: refund.id, amount: refund.amount, status: "REFUNDED", remaining: 0, reason: input.reason });
  await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","targetType","targetId",action,"beforeJson","afterJson","createdAt") VALUES (${crypto.randomUUID()},${userId},'CoursePurchase',${order.id},'REFUND',${before}::jsonb,${after}::jsonb,NOW())`;
  return refund;
}
