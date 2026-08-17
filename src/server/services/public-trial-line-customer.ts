import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { probeStoreLineRecipient } from "@/lib/line";

const customerSelect = {
  id: true,
  name: true,
  assignedStaffId: true,
  lineUserId: true,
  lineLinkStatus: true,
} satisfies Prisma.CustomerSelect;

type PublicTrialLineCustomer = Prisma.CustomerGetPayload<{
  select: typeof customerSelect;
}>;

export type ResolvePublicTrialLineCustomerResult =
  | { status: "matched" | "rebound"; customer: PublicTrialLineCustomer }
  | { status: "not_found" }
  | { status: "conflict" }
  | { status: "verification_unavailable" };

/**
 * Resolves the customer for a store-signed, one-time LINE booking entry.
 *
 * The entry identity comes from the store Messaging API webhook, so it may
 * repair a same-store phone row that still contains a historical LINE Login
 * subject. The old value must first be definitively rejected by this store's
 * Messaging API; outages and configuration errors always fail closed.
 */
export async function resolvePublicTrialLineCustomer(input: {
  storeId: string;
  phone: string;
  messagingLineUserId: string;
}): Promise<ResolvePublicTrialLineCustomerResult> {
  const messagingLineUserId = input.messagingLineUserId.trim();
  const exact = await prisma.customer.findFirst({
    where: {
      storeId: input.storeId,
      lineUserId: messagingLineUserId,
      mergedIntoCustomerId: null,
    },
    select: customerSelect,
  });
  if (exact) return { status: "matched", customer: exact };

  const phoneMatches = await prisma.customer.findMany({
    where: {
      storeId: input.storeId,
      phone: input.phone,
      mergedIntoCustomerId: null,
    },
    select: customerSelect,
    take: 2,
  });
  if (phoneMatches.length === 0) return { status: "not_found" };
  if (phoneMatches.length > 1) return { status: "conflict" };

  const candidate = phoneMatches[0];
  if (candidate.lineUserId) {
    const probe = await probeStoreLineRecipient(input.storeId, candidate.lineUserId);
    if (probe.status === "COMPATIBLE") return { status: "conflict" };
    if (probe.status === "UNAVAILABLE") return { status: "verification_unavailable" };
  }

  try {
    const rebound = await prisma.customer.updateMany({
      where: {
        id: candidate.id,
        storeId: input.storeId,
        phone: input.phone,
        lineUserId: candidate.lineUserId,
        mergedIntoCustomerId: null,
      },
      data: {
        lineUserId: messagingLineUserId,
        lineLinkStatus: "LINKED",
        lineLinkedAt: new Date(),
      },
    });
    if (rebound.count !== 1) return { status: "conflict" };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { status: "conflict" };
    }
    throw error;
  }

  const customer = await prisma.customer.findFirst({
    where: {
      id: candidate.id,
      storeId: input.storeId,
      lineUserId: messagingLineUserId,
      mergedIntoCustomerId: null,
    },
    select: customerSelect,
  });
  return customer
    ? { status: "rebound", customer }
    : { status: "conflict" };
}
