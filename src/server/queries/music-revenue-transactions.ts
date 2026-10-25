import "server-only";
import {coursePrisma} from "@/lib/course-db";
import {prisma} from "@/lib/db";
import {dayRange,formatTWTime} from "@/lib/date-utils";
import {musicPurchaseWhere} from "@/server/services/music-finance-scope";
import {readMusicTuition,readMusicReceipts} from "@/server/services/music-tuition";
import type {Prisma} from "../../../generated/course-client";
export type RevenueTransactionsInput={from:string;to:string;dataScope?:string;status?:string;staff?:string;page?:string;purchaseId?:string;customerId?:string};
export async function getMusicRevenueTransactions(storeId:string,input:RevenueTransactionsInput){
 const {from,to,status,staff}=input;
 const where:Prisma.CoursePurchaseWhereInput={storeId,...musicPurchaseWhere(storeId,input.dataScope),...(input.purchaseId?{id:input.purchaseId}:{}),...(input.customerId?{customerId:input.customerId}:{}),createdAt:{gte:dayRange(from).start,lte:dayRange(to).end},...(status?{status}:{}),...(staff?{confirmedBy:staff}:{})};
  const requestedPage = Math.max(1, Math.floor(Number(input.page) || 1));
  const readOrders = (page:number) => coursePrisma.coursePurchase.findMany({ where, include: { refunds: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 30, take: 30 });
  const [count, requestedOrders] = await Promise.all([
    coursePrisma.coursePurchase.count({ where }), requestedPage === 1 ? readOrders(1) : Promise.resolve(null),
  ]);
  const pages = Math.max(1, Math.ceil(count / 30));
  const page = Math.min(pages, requestedPage);
  const orders = requestedOrders ?? await readOrders(page);
  const cardIds = orders.flatMap((order) => order.cardId ? [order.cardId] : []);
  const [customers, cards, held, attended,tuition,receipts] = await Promise.all([
    prisma.customer.findMany({ where: { storeId, id: { in: orders.map((order) => order.customerId) } }, select: { id: true, name: true } }),
    coursePrisma.coursePointCard.findMany({ where: { storeId, id: { in: cardIds } } }),
    coursePrisma.courseBooking.groupBy({ by: ["cardId"], where: { storeId, cardId: { in: cardIds }, status: "RESERVED" }, _sum: { pointCost: true } }),
    coursePrisma.courseBooking.groupBy({ by: ["cardId"], where: { storeId, cardId: { in: cardIds }, status: "ATTENDED" }, _count: true, _sum: { pointCost: true } }),
    readMusicTuition(coursePrisma,storeId,orders.map(o=>o.id)),
    readMusicReceipts(coursePrisma,storeId,orders.map(o=>o.id)),
  ]);
  const names = new Map(customers.map((c) => [c.id, c.name]));
  const rows = orders.map((order) => {
    const card = cards.find((c) => c.id === order.cardId);
    return { ...order, tuitionDue:tuition.get(order.id)?.due, tuitionReceipts:tuition.has(order.id)?receipts.filter(r=>r.purchaseId===order.id).map(r=>({id:r.id,amount:r.amount,date:formatTWTime(r.paidAt,{dateOnly:true}),method:r.method,lastFour:r.lastFour})):undefined, discountValue: order.discountValue == null ? null : Number(order.discountValue), date: formatTWTime(order.createdAt, { dateOnly: true }), customerName: names.get(order.customerId) ?? "顧客資料待核對", remaining: card?.remaining ?? null,
      reserved: held.find((b) => b.cardId === order.cardId)?._sum.pointCost ?? 0,
      attended: attended.find((b) => b.cardId === order.cardId)?._count ?? 0,
      usedQuota: attended.find((b) => b.cardId === order.cardId)?._sum.pointCost ?? 0,
      expiresAt: card && !card.musicOpeningStateRequired && card.musicValidityDays && !card.musicActivatedAt ? `首次上課起 ${card.musicValidityDays} 天` : card?.expiresAt ? formatTWTime(card.expiresAt, { dateOnly: true }) : null,
      refunds: order.refunds.map((r) => ({ amount: r.amount, reason: r.reason, method: r.method, date: formatTWTime(r.createdAt, { dateOnly: true }) })),
    };
  });

 return {count,pages,page,rows};
}
export type RevenueTransactions=Awaited<ReturnType<typeof getMusicRevenueTransactions>>;
