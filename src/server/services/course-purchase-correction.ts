import "server-only";
import type { Prisma } from "../../../generated/course-client";
import { AppError } from "@/lib/errors";
type Actor = { storeId: string; userId: string };
async function audit(tx: Prisma.TransactionClient, actor: Actor, id: string, action: string, before: object, after: object) {
  await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","targetType","targetId",action,"beforeJson","afterJson","createdAt") VALUES (${crypto.randomUUID()},${actor.userId},'CoursePurchase',${id},${action},${JSON.stringify({ storeId: actor.storeId, ...before })}::jsonb,${JSON.stringify({ storeId: actor.storeId, ...after })}::jsonb,NOW())`;
}
/** All callers hold courseTransaction's store lock and require writable permission. */
export async function voidCoursePurchaseInTransaction(tx: Prisma.TransactionClient, actor: Actor, input: { purchaseId: string; reason: string }) {
  const order = await tx.coursePurchase.findFirst({ where: { id: input.purchaseId, storeId: actor.storeId }, include: { refunds: true } });
  if (!order) throw new AppError("NOT_FOUND", "找不到本店交易");
  if (order.status === "VOIDED") {
    if (order.voidReason !== input.reason) throw new AppError("CONFLICT", "此交易已作廢，請查看原作廢原因");
    return order;
  }
  if (order.refunds.length || !["PENDING", "CONFIRMED"].includes(order.status))
    throw new AppError("BUSINESS_RULE", "此交易已退款或結清，無法作廢");
  if (order.status === "CONFIRMED" && !order.cardId)
    throw new AppError("BUSINESS_RULE", "已核帳交易缺少方案卡，請先核對");
  if (order.cardId) {
    const card = await tx.coursePointCard.findFirst({ where: { id: order.cardId, storeId: actor.storeId }, include: { entries: true } });
    const bookings = await tx.courseBooking.count({ where: { storeId: actor.storeId, cardId: order.cardId } });
    if (!card || card.closedAt || card.remaining !== order.points || bookings || card.entries.length !== 1 || card.entries[0].kind !== "GRANT" || card.entries[0].points !== order.points)
      throw new AppError("BUSINESS_RULE", "此方案已有預約或額度異動，不能直接作廢交易。");
    const sources = await tx.coursePurchase.count({ where: { storeId: actor.storeId, cardId: card.id } });
    if (sources !== 1) throw new AppError("BUSINESS_RULE", "方案來源不唯一，不能直接作廢。");
    await tx.coursePointCard.update({ where: { id: card.id }, data: { remaining: 0, closedAt: new Date() } });
    await tx.coursePointEntry.create({ data: { storeId: actor.storeId, cardId: card.id, kind: "VOID", points: card.remaining, actorUserId: actor.userId } });
  }
  if (order.status === "CONFIRMED" && order.price > 0) {
    const receipts = await tx.$queryRaw<Array<{ amount: unknown; type: string; paymentMethod: string }>>`SELECT amount,type::text,"paymentMethod"::text FROM "CashbookEntry" WHERE id=${"course-purchase:" + order.id} AND "storeId"=${actor.storeId} FOR UPDATE`;
    if (!receipts[0] || Number(receipts[0].amount) !== order.price || receipts[0].type !== "INCOME" || receipts[0].paymentMethod !== "OTHER")
      throw new AppError("BUSINESS_RULE", "原收款紀錄不一致，尚未作廢。");
    // Reverse the erroneous noncash receipt on its original accounting date.
    // Keep both rows and audit; never represent a void as a real customer refund.
    await tx.$executeRaw`INSERT INTO "CashbookEntry" (id,"storeId","entryDate",type,"paymentMethod",category,amount,note,"createdByUserId","updatedAt") SELECT ${"course-void:" + order.id},"storeId","entryDate",'EXPENSE','OTHER','課程誤建沖銷',amount,${"作廢：" + input.reason},${actor.userId},NOW() FROM "CashbookEntry" WHERE id=${"course-purchase:" + order.id} AND "storeId"=${actor.storeId}`;
  }
  const result = await tx.coursePurchase.update({ where: { id: order.id }, data: { status: "VOIDED", voidedAt: new Date(), voidedBy: actor.userId, voidReason: input.reason } });
  await audit(tx, actor, order.id, "VOID", { status: order.status, price: order.price }, { status: "VOIDED", reason: input.reason });
  return result;
}
export async function editCoursePurchaseInTransaction(tx: Prisma.TransactionClient, actor: Actor, input: { purchaseId: string; note: string; revenueStaffId: string | null; reason: string }) {
  const order = await tx.coursePurchase.findFirst({ where: { id: input.purchaseId, storeId: actor.storeId } });
  if (!order) throw new AppError("NOT_FOUND", "找不到本店交易");
  if (order.status === "VOIDED" || order.status === "REFUNDED") throw new AppError("BUSINESS_RULE", "已作廢／退款交易保留原紀錄，不能再修改。");
  if (input.revenueStaffId) {
    const staff = await tx.$queryRaw<Array<{ id: string }>>`SELECT s.id FROM "Staff" s JOIN "User" u ON u.id=s."userId" WHERE s.id=${input.revenueStaffId} AND s."storeId"=${actor.storeId} AND s.status::text='ACTIVE' AND u.status::text='ACTIVE'`;
    if (!staff.length) throw new AppError("FORBIDDEN", "請選擇本店啟用的人員");
  }
  if (order.note === input.note && order.revenueStaffId === input.revenueStaffId) return order;
  const result = await tx.coursePurchase.update({ where: { id: order.id }, data: { note: input.note, revenueStaffId: input.revenueStaffId } });
  await tx.$executeRaw`UPDATE "CashbookEntry" SET note=${"線上購買：" + order.name + (input.note ? " / " + input.note : "")},"staffId"=${input.revenueStaffId},"updatedAt"=NOW() WHERE id=${"course-purchase:" + order.id} AND "storeId"=${actor.storeId}`;
  await audit(tx, actor, order.id, "EDIT", { note: order.note, revenueStaffId: order.revenueStaffId }, { note: input.note, revenueStaffId: input.revenueStaffId, reason: input.reason });
  return result;
}
