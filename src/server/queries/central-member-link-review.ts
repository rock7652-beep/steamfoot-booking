import { prisma } from "@/lib/db";
import {
  detectCentralMemberHealthIssues,
  type CentralMemberHealthIssue,
} from "@/server/services/central-member-health";

export type CentralMemberHealthIssueView = CentralMemberHealthIssue & {
  customers: Array<{ id: string; name: string; phone: string }>;
};

export async function getCentralMemberHealthIssues(
  storeId: string,
): Promise<CentralMemberHealthIssueView[]> {
  const [customers, links] = await Promise.all([
    prisma.customer.findMany({
      where: {
        OR: [
          { storeId },
          { identityLinks: { some: { storeId } } },
        ],
      },
      select: {
        id: true,
        storeId: true,
        name: true,
        phone: true,
        userId: true,
        googleId: true,
        lineUserId: true,
        mergedIntoCustomerId: true,
      },
    }),
    prisma.customerIdentityLink.findMany({
      where: {
        OR: [{ storeId }, { customer: { storeId } }],
      },
      select: {
        id: true,
        storeId: true,
        customerId: true,
        userId: true,
        provider: true,
        providerAccountId: true,
        lineUserId: true,
      },
    }),
  ]);
  const customerById = new Map(customers.map((customer) => [customer.id, customer] as const));
  return detectCentralMemberHealthIssues(storeId, customers, links).map((issue) => ({
    ...issue,
    customers: issue.customerIds.flatMap((id) => {
      const customer = customerById.get(id);
      return customer ? [{ id: customer.id, name: customer.name, phone: customer.phone }] : [];
    }),
  }));
}

export async function getCentralMemberLinkReviewRequests(storeId: string) {
  return prisma.centralMemberLinkReviewRequest.findMany({
    where: { storeId },
    select: {
      id: true,
      type: true,
      status: true,
      createdAt: true,
      reviewedAt: true,
      reviewNote: true,
      identityLinkId: true,
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          planWallets: {
            where: { storeId, status: "ACTIVE", remainingSessions: { gt: 0 } },
            select: { remainingSessions: true },
          },
        },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
}

export async function countPendingCentralMemberLinkReviews(storeId: string) {
  const [pendingRequests, healthIssues] = await Promise.all([
    prisma.centralMemberLinkReviewRequest.count({ where: { storeId, status: "PENDING" } }),
    getCentralMemberHealthIssues(storeId).then((issues) => issues.length),
  ]);
  return pendingRequests + healthIssues;
}
