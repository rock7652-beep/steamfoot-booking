import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Reuse an explicit central membership without claiming Customer.userId. */
export async function resolveWebLineLinkedMember(input: {
  storeId: string;
  subject: string;
  expectedUserId: string;
  expectedCustomerId: string;
}): Promise<string | null> {
  try {
    return await prisma.$transaction(async (tx) => {
      const link = await tx.customerIdentityLink.findUnique({
        where: { uq_customer_identity_provider_store: {
          provider: "line", providerAccountId: input.subject, storeId: input.storeId,
        } },
        include: { user: true, customer: true },
      });
      if (!link || link.userId !== input.expectedUserId ||
          link.customerId !== input.expectedCustomerId ||
          link.customer.storeId !== input.storeId ||
          link.customer.mergedIntoCustomerId !== null ||
          (link.customer.userId !== null && link.customer.userId !== link.userId) ||
          link.user.status !== "ACTIVE" || link.user.role !== "CUSTOMER") return null;

      const accountKey = { provider: "line", providerAccountId: input.subject };
      const account = await tx.account.findUnique({ where: { provider_providerAccountId: accountKey } });
      if (account && account.userId !== link.userId) return null;
      if (!account) {
        // Persist only the verified identity, never duplicate the central User
        // or change the per-store Customer's legacy owner/notification ID.
        await tx.account.create({ data: { ...accountKey, userId: link.userId, type: "oauth" } });
      }
      return link.userId;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2034")) return null;
    throw error;
  }
}
