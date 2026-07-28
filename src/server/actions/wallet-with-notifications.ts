"use server";

import { prisma } from "@/lib/db";
import { notifyStoreManagerOnLine } from "@/server/services/store-manager-line-notifications";
import {
  assignPlanToCustomer as assignPlanToCustomerCore,
  initiateCustomerPlanPurchase as initiateCustomerPlanPurchaseCore,
} from "@/server/actions/wallet-core";

export * from "@/server/actions/wallet-core";

type AssignPlanInput = Parameters<typeof assignPlanToCustomerCore>[0];
type CustomerPurchaseInput = Parameters<typeof initiateCustomerPlanPurchaseCore>[0];

async function notifyPendingPaymentBestEffort(transactionId: string): Promise<void> {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      select: {
        id: true,
        storeId: true,
        customerId: true,
        planId: true,
        amount: true,
        paymentStatus: true,
        bankLast5: true,
        transferLastFour: true,
      },
    });

    if (!transaction || transaction.paymentStatus !== "PENDING") return;

    const [store, customer, plan] = await Promise.all([
      prisma.store.findUnique({
        where: { id: transaction.storeId },
        select: { slug: true },
      }),
      prisma.customer.findUnique({
        where: { id: transaction.customerId },
        select: { name: true },
      }),
      transaction.planId
        ? prisma.servicePlan.findUnique({
            where: { id: transaction.planId },
            select: { name: true },
          })
        : Promise.resolve(null),
    ]);

    if (!store || !customer) {
      console.warn("[PendingPaymentLineNotification] related record missing", {
        transactionId,
        storeId: transaction.storeId,
        customerId: transaction.customerId,
      });
      return;
    }

    await notifyStoreManagerOnLine({
      type: "TRANSFER_PENDING_CONFIRMATION",
      eventKey: `pending-payment:${transaction.id}`,
      storeId: transaction.storeId,
      storeSlug: store.slug,
      customerName: customer.name,
      paymentId: transaction.id,
      planName: plan?.name ?? "未指定方案",
      amount: Number(transaction.amount),
      lastFourDigits: transaction.transferLastFour ?? transaction.bankLast5,
    });
  } catch (error) {
    console.error("[PendingPaymentLineNotification] notification failed", {
      transactionId,
      error: error instanceof Error ? error.message : "Unknown notification error",
    });
  }
}

/**
 * Staff-side plan assignment. The core transaction remains authoritative;
 * notification is attempted only after a newly-created PENDING transaction
 * has committed successfully.
 */
export async function assignPlanToCustomer(input: AssignPlanInput) {
  const result = await assignPlanToCustomerCore(input);
  if (result.success && input.paymentStatus === "PENDING") {
    await notifyPendingPaymentBestEffort(result.data.transactionId);
  }
  return result;
}

/**
 * Customer self-purchase always creates a TRANSFER/PENDING transaction.
 * LINE delivery is best-effort and never changes the purchase result.
 */
export async function initiateCustomerPlanPurchase(input: CustomerPurchaseInput) {
  const result = await initiateCustomerPlanPurchaseCore(input);
  if (result.success) {
    await notifyPendingPaymentBestEffort(result.data.transactionId);
  }
  return result;
}
