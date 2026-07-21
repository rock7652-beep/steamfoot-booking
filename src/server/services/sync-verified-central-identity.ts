import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  decideCentralIdentityEntry,
  type CentralIdentityEntryPoint,
} from "@/server/services/central-identity-entry-policy";

type VerifiedEntryPoint = Exclude<CentralIdentityEntryPoint, "staff_created">;

export type SyncVerifiedCentralIdentityResult =
  | { status: "linked" | "already_linked" }
  | { status: "manual_review"; reason: string }
  | { status: "rejected"; reason: string };

export async function syncVerifiedCentralIdentity(input: {
  entryPoint: VerifiedEntryPoint;
  userId: string;
  storeId: string;
  customerId: string;
  provider: string;
  providerAccountId: string;
  verifiedPhoneMatches?: boolean;
  lineUserId?: string | null;
}): Promise<SyncVerifiedCentralIdentityResult> {
  if (
    !input.userId ||
    !input.storeId ||
    !input.customerId ||
    !input.provider ||
    !input.providerAccountId
  ) {
    return { status: "rejected", reason: "identity_not_verified" };
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        const customer = await tx.customer.findUnique({
          where: { id: input.customerId },
          select: {
            id: true,
            storeId: true,
            userId: true,
            mergedIntoCustomerId: true,
          },
        });

        if (!customer || customer.storeId !== input.storeId) {
          return { status: "rejected", reason: "identity_not_verified" };
        }

        const links = await tx.customerIdentityLink.findMany({
          where: {
            storeId: input.storeId,
            provider: input.provider,
            OR: [
              { providerAccountId: input.providerAccountId },
              { userId: input.userId },
              { customerId: input.customerId },
            ],
          },
          select: { userId: true, customerId: true, providerAccountId: true },
        });

        const conflictingLink = links.find(
          (link) =>
            link.userId !== input.userId ||
            link.customerId !== input.customerId ||
            link.providerAccountId !== input.providerAccountId,
        );
        const exactLink = links.find(
          (link) =>
            link.userId === input.userId &&
            link.customerId === input.customerId &&
            link.providerAccountId === input.providerAccountId,
        );

        const decision = decideCentralIdentityEntry({
          entryPoint: input.entryPoint,
          providerIdentityVerified: true,
          verifiedPhoneMatches: input.verifiedPhoneMatches ?? false,
          candidateState: customer.mergedIntoCustomerId ? "merged" : "single_active",
          candidateOwnership:
            customer.userId == null
              ? "unowned"
              : customer.userId === input.userId
                ? "same_user"
                : "another_user",
          existingLink: conflictingLink
            ? "different_customer"
            : exactLink
              ? "same_customer"
              : "none",
        });

        if (decision.action === "manual_review") {
          return { status: "manual_review", reason: decision.reason };
        }
        if (decision.action === "reject") {
          return { status: "rejected", reason: decision.reason };
        }
        if (decision.action === "reuse_verified_link") {
          return { status: "already_linked" };
        }
        if (decision.action !== "link_existing_customer") {
          return { status: "rejected", reason: "identity_not_verified" };
        }

        await tx.customerIdentityLink.create({
          data: {
            userId: input.userId,
            storeId: input.storeId,
            customerId: input.customerId,
            provider: input.provider,
            providerAccountId: input.providerAccountId,
            lineUserId: input.lineUserId ?? null,
          },
        });
        return { status: "linked" };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      return { status: "manual_review", reason: "existing_membership_conflict" };
    }
    throw error;
  }
}
