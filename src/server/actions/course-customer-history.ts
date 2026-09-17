"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { AppError, handleActionError } from "@/lib/errors";
import { courseManager } from "@/server/services/course-access";

export async function loadCourseCustomerPurchases(input: unknown) {
  try {
    const customerId = z.string().min(1).max(100).parse(input);
    const { storeId } = await courseManager("customer.read");
    await courseManager("transaction.read");
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId, mergedIntoCustomerId: null }, select: { id: true },
    });
    if (!customer) throw new AppError("NOT_FOUND", "找不到本店顧客");
    const orders = await coursePrisma.coursePurchase.findMany({
      where: { storeId, customerId }, orderBy: { createdAt: "desc" }, take: 100,
      select: {
        id: true, name: true, price: true, points: true, unit: true, status: true,
        createdAt: true, confirmedAt: true, note: true, voidReason: true,
        refunds: { where: { storeId }, orderBy: { createdAt: "desc" }, select: { id: true, amount: true, method: true, reason: true, createdAt: true } },
      },
    });
    return { success: true as const, data: orders.map(order => ({
      ...order, createdAt: order.createdAt.toISOString(), confirmedAt: order.confirmedAt?.toISOString() ?? null,
      refunds: order.refunds.map(refund => ({ ...refund, createdAt: refund.createdAt.toISOString() })),
    })) };
  } catch (error) { return handleActionError(error); }
}
