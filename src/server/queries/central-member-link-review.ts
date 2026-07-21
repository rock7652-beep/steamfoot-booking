import { prisma } from "@/lib/db";

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
  return prisma.centralMemberLinkReviewRequest.count({
    where: { storeId, status: "PENDING" },
  });
}
