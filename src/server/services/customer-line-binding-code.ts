import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Messaging-channel proof only; never synthesizes a LINE Login identity. */
export async function consumeCustomerLineBindingCode(input: { customerId: string; storeId: string; code: string; lineUserId: string }): Promise<boolean> {
  try {
    return await prisma.$transaction(async tx => {
      const links = await tx.customerIdentityLink.findMany({ where: {
        storeId: input.storeId, provider: "line",
        OR: [{ customerId: input.customerId }, { lineUserId: input.lineUserId }, { providerAccountId: input.lineUserId }],
      }, select: { id: true } });
      // Drifted Login links require the verified recovery flow. A Messaging
      // code cannot resolve them or take an identity from another customer.
      if (links.length) return false;
      const updated = await tx.customer.updateMany({ where: {
        id: input.customerId, storeId: input.storeId, mergedIntoCustomerId: null,
        lineUserId: null, lineLinkStatus: "UNLINKED", lineBindingCode: input.code,
        lineBindingCodeCreatedAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }, data: {
        lineUserId: input.lineUserId, lineLinkStatus: "LINKED", lineLinkedAt: new Date(),
        lineBindingCode: null, lineBindingCodeCreatedAt: null,
      } });
      return updated.count === 1;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) return false;
    throw error;
  }
}
