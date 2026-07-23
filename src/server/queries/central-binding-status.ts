import { prisma } from "@/lib/db";
import {
  resolveCentralBindingStatus,
  type CentralBindingStatus,
} from "@/server/services/central-binding-status";

export interface CentralBindingStatusRow {
  id: string;
  name: string;
  phone: string;
  status: CentralBindingStatus;
}

export async function listCentralBindingStatuses(
  storeId: string,
): Promise<CentralBindingStatusRow[]> {
  const customers = await prisma.customer.findMany({
    where: { storeId, mergedIntoCustomerId: null },
    select: {
      id: true,
      name: true,
      phone: true,
      userId: true,
      identityLinks: {
        where: { storeId },
        select: {
          userId: true,
          user: {
            select: {
              accounts: {
                where: { provider: "line" },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      },
      user: {
        select: {
          accounts: {
            where: { provider: "line" },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
  });

  return customers.map((customer) => {
    const verifiedLink = customer.identityLinks[0];
    const hasCentralLine = verifiedLink
      ? verifiedLink.user.accounts.length > 0
      : (customer.user?.accounts.length ?? 0) > 0;

    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      status: resolveCentralBindingStatus({
        hasVerifiedMemberLink: Boolean(verifiedLink),
        hasCentralUser: Boolean(verifiedLink || customer.userId),
        hasCentralLine,
      }),
    };
  });
}

