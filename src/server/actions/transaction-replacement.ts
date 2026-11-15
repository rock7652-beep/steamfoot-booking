"use server";
import { prisma } from "@/lib/db";
import { requirePermission, checkPermission } from "@/lib/permissions";
import { currentStoreId } from "@/lib/store";
import { AppError, handleActionError } from "@/lib/errors";
import { toLocalDateStr } from "@/lib/date-utils";

export async function fetchTransactionReplacementContext(sourceId: string) {
  try {
    const user = await requirePermission("wallet.create");
    await requirePermission("transaction.void");
    const storeId = currentStoreId(user);
    const source = await prisma.transaction.findUnique({ where: { id: sourceId } });
    if (!source || source.storeId !== storeId || !source.customerId)
      throw new AppError("NOT_FOUND", "找不到本店原交易");
    if (source.status !== "VOIDED" || !["SINGLE_PURCHASE", "PACKAGE_PURCHASE"].includes(source.transactionType)
      || !["SUCCESS", "CONFIRMED"].includes(source.paymentStatus))
      throw new AppError("BUSINESS_RULE", "此交易目前不能補登收費");
    const prior = await prisma.transactionAuditLog.findFirst({ where: {
      storeId, transactionId: sourceId, action: "UPDATE_NOTE",
      afterJson: { path: ["kind"], equals: "PURCHASE_REPLACEMENT" },
    } });
    if (prior) throw new AppError("CONFLICT", "此交易已補登完成，請查看顧客的最新交易");
    const [plans, canDiscount] = await Promise.all([
      prisma.servicePlan.findMany({ where: { storeId, isActive: true, category: { not: "TRIAL" } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, category: true, price: true, sessionCount: true, validityDays: true } }),
      checkPermission(user.role, user.staffId, "transaction.discount"),
    ]);
    return { success: true as const, data: {
      customerId: source.customerId, businessDate: toLocalDateStr(source.transactionDate),
      paymentMethod: source.paymentMethod, canDiscount,
      plans: plans.map(plan => ({ ...plan, price: Number(plan.price) })),
    } };
  } catch (error) { return handleActionError(error); }
}
