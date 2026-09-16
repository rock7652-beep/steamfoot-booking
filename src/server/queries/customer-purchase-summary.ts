import "server-only";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { resolveCustomerForUser } from "@/server/queries/customer-completion";

export async function getCustomerPurchaseSummary(storeId: string, storeSlug: string, txId?: string) {
  const user = await getCurrentUser();
  if (!user || !txId) return null;
  const resolved = await resolveCustomerForUser({ userId: user.id, sessionCustomerId: user.customerId ?? null, sessionEmail: user.email ?? null, storeId, storeSlug });
  if (!resolved.customer) return null;
  return prisma.transaction.findFirst({
    where: { id: txId, storeId, customerId: resolved.customer.id, paymentMethod: "TRANSFER" },
    select: { id: true, transactionNo: true, planNameSnapshot: true, amount: true, transferLastFour: true, paymentStatus: true, customer: { select: { name: true } } },
  });
}
