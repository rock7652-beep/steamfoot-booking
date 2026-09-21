import "server-only";
import type { Prisma } from "../../../generated/course-client";
import { AppError } from "@/lib/errors";
import { toLocalDateStr } from "@/lib/date-utils";

/** Caller authorizes transaction.refund and holds the course store lock. */
export async function refundUnusedCoursePurchase(
  tx: Prisma.TransactionClient,
  actor: { storeId: string; userId: string },
  input: { purchaseId: string; reason: string; requestKey: string; amount?: number; method?: "CASH" | "BANK_TRANSFER" | "CARD" | "OTHER"; expectedRemaining?: number; expectedRefundedAmount?: number },
) {
  const { storeId, userId } = actor;
  const previous = await tx.coursePurchaseRefund.findUnique({
    where: { storeId_requestKey: { storeId, requestKey: input.requestKey } },
  });
  if (previous) {
    if (previous.purchaseId !== input.purchaseId || previous.reason !== input.reason || (input.amount !== undefined && previous.amount !== input.amount) || (input.method !== undefined && previous.method !== input.method))
      throw new AppError("CONFLICT", "退款請求已使用，請重新確認");
    return previous;
  }
  const order = await tx.coursePurchase.findFirst({
    where: { id: input.purchaseId, storeId }, include: { refunds: true },
  });
  if (!order) throw new AppError("NOT_FOUND", "找不到本店購買紀錄");
  const refundedAmount = order.refunds.reduce((sum, refund) => sum + refund.amount, 0);
  const maximumRefund = Math.max(0, order.price - refundedAmount);
  if (input.amount === undefined && (order.refunds.length || order.status === "REFUNDED"))
    throw new AppError("BUSINESS_RULE", "此購買已退款，請查看原退款紀錄");
  if (!["CONFIRMED", "REFUNDED"].includes(order.status) || !order.cardId || order.price <= 0)
    throw new AppError("BUSINESS_RULE", "僅可退回已核帳購買的實付金額");
  const card = await tx.coursePointCard.findFirst({
    where: { id: order.cardId, storeId }, include: { entries: true },
  });
  if (!card || (card.closedAt && order.status !== "REFUNDED")) throw new AppError("BUSINESS_RULE", "方案已結清或資料不完整");
  if (card.remaining < 0 || (card.closedAt && card.remaining !== 0)) throw new AppError("BUSINESS_RULE", "卡片結清狀態與額度不一致，請先核對。");
  const amount = input.amount ?? maximumRefund;
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > maximumRefund)
    throw new AppError("BUSINESS_RULE", `退款金額須大於零且不得超過尚可退款金額 ${maximumRefund} 元。`);
  if (input.amount !== undefined && (input.expectedRemaining !== card.remaining || input.expectedRefundedAmount !== refundedAmount))
    throw new AppError("CONFLICT", "方案額度或已退款金額已變動，請重新開啟明細核對。");
  const reserved = await tx.courseBooking.count({ where: { storeId, cardId: card.id, status: "RESERVED" } });
  if (reserved) throw new AppError("BUSINESS_RULE", "此方案仍有預約占用，請先處理相關預約再登錄退款；本次未取消任何預約。");
  const attended = await tx.courseBooking.count({ where: { storeId, cardId: card.id, status: "ATTENDED" } });
  if (input.amount === undefined && (attended || card.remaining !== order.points))
    throw new AppError("BUSINESS_RULE", "此方案已有使用或額度調整，請重新開啟交易並輸入協商退款金額。");
  const grants = card.entries.filter((entry) => entry.kind === "GRANT");
  if (input.amount === undefined && (grants.length !== 1 || grants[0].points !== order.points || card.entries.some((entry) => entry.kind === "REFUND")))
    throw new AppError("BUSINESS_RULE", "方案有贈送、調整或退款異動，請先核對來源。");
  // Verify the original accounting entry, rather than refunding a stale price alone.
  const receipts = await tx.$queryRaw<Array<{ amount: unknown; type: string; paymentMethod: string }>>`
    SELECT amount,type::text,"paymentMethod"::text FROM "CashbookEntry"
    WHERE id=${"course-purchase:" + order.id} AND "storeId"=${storeId} FOR UPDATE`;
  const receipt = receipts[0];
  if (!receipt || Number(receipt.amount) !== order.price || receipt.type !== "INCOME" || receipt.paymentMethod !== (order.paymentMethod === "CASH" ? "CASH" : "OTHER"))
    throw new AppError("BUSINESS_RULE", "原收款紀錄不一致，請先核對帳務，尚未退款。");
  const method = input.method ?? "OTHER";
  const businessDate = new Date(toLocalDateStr() + "T00:00:00Z");
  if (method === "CASH") {
    const drawers = await tx.$queryRaw<Array<{id:string;status:string}>>`SELECT id,status::text FROM "CashDrawerSession" WHERE "storeId"=${storeId} AND "businessDate"=${businessDate} FOR UPDATE`;
    if (!drawers[0] || drawers[0].status !== "OPEN") throw new AppError("BUSINESS_RULE", "現金退款需先開啟今日現金抽屜；已結帳請先依既有流程處理。");
    // Invalidate a closing snapshot calculated before this cash movement.
    await tx.$executeRaw`UPDATE "CashDrawerSession" SET "updatedAt"=GREATEST(clock_timestamp(),"updatedAt"+interval '1 millisecond') WHERE id=${drawers[0].id} AND "storeId"=${storeId}`;
  }
  const refund = await tx.coursePurchaseRefund.create({ data: {
    storeId, purchaseId: order.id, amount, method, points: card.remaining,
    reason: input.reason, actorUserId: userId, requestKey: input.requestKey,
  } });
  if (!card.closedAt) await tx.coursePointCard.update({ where: { id: card.id }, data: { remaining: 0, closedAt: new Date() } });
  if (card.remaining > 0) await tx.coursePointEntry.create({ data: { storeId, cardId: card.id, kind: "REFUND", points: card.remaining, actorUserId: userId } });
  await tx.coursePurchase.update({ where: { id: order.id }, data: { status: "REFUNDED" } });
  await tx.$executeRaw`INSERT INTO "CashbookEntry" (id,"storeId","entryDate",type,"paymentMethod",category,amount,note,"createdByUserId","updatedAt") VALUES (${"course-refund:" + refund.id},${storeId},${businessDate},'EXPENSE',${method === "CASH" ? "CASH" : "OTHER"}::"CashbookPaymentMethod",'課程退款',${refund.amount},${"登錄退款（" + method + "）：" + order.name + " / " + input.reason},${userId},NOW())`;
  const before = JSON.stringify({ storeId, purchaseId: order.id, status: order.status, remaining: card.remaining });
  const after = JSON.stringify({ storeId, purchaseId: order.id, refundId: refund.id, amount: refund.amount, method, refundedAmount: refundedAmount + amount, retiredQuota: card.remaining, status: "REFUNDED", remaining: 0, reason: input.reason, externalPaymentExecuted: false });
  await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","targetType","targetId",action,"beforeJson","afterJson","createdAt") VALUES (${crypto.randomUUID()},${userId},'CoursePurchase',${order.id},'REFUND',${before}::jsonb,${after}::jsonb,NOW())`;
  return refund;
}
