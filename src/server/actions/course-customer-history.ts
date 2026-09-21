"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { AppError, handleActionError } from "@/lib/errors";
import { courseManager } from "@/server/services/course-access";
import { courseHistoryRange } from "@/lib/course-history-range";

export async function loadCourseCustomerPurchases(input: unknown, offset = 0, range: {from?:string;to?:string} = {}) {
  try {
    const skip = z.number().int().min(0).max(1000000).parse(offset);
    const customerId = z.string().min(1).max(100).parse(input);
    const { storeId } = await courseManager("customer.read");
    await courseManager("transaction.read");
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId, mergedIntoCustomerId: null }, select: { id: true },
    });
    if (!customer) throw new AppError("NOT_FOUND", "找不到本店顧客");
    const orders = await coursePrisma.coursePurchase.findMany({
      where: { storeId, customerId, createdAt: courseHistoryRange(range) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take: 11,
      select: {
        id: true, name: true, price: true, points: true, unit: true, status: true,
        listPrice: true, discountKind: true, discountValue: true, paymentMethod: true, transferLastFour: true,
        createdAt: true, confirmedAt: true, note: true, voidReason: true,
        refunds: { where: { storeId }, orderBy: { createdAt: "desc" }, select: { id: true, amount: true, method: true, reason: true, createdAt: true } },
      },
    });
    return { success: true as const, hasMore: orders.length > 10, data: orders.slice(0,10).map(order => ({
      ...order, discountValue: order.discountValue == null ? null : Number(order.discountValue), createdAt: order.createdAt.toISOString(), confirmedAt: order.confirmedAt?.toISOString() ?? null,
      refunds: order.refunds.map(refund => ({ ...refund, createdAt: refund.createdAt.toISOString() })),
    })) };
  } catch (error) { const failure=handleActionError(error); return {success:false as const,error:failure.success?"讀取失敗":failure.error}; }
}
