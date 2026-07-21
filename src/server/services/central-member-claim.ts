import { compareSync } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/normalize";

export type CentralMemberClaimConflictReason =
  | "invalid_credentials"
  | "phone_unavailable"
  | "multiple_customers_in_store"
  | "customer_owned_by_another_user"
  | "identity_owned_by_another_user"
  | "existing_membership_conflict";

export type CentralMemberClaimResult =
  | { status: "claimed"; claimedStoreIds: string[] }
  | { status: "nothing_to_claim"; claimedStoreIds: [] }
  | {
      status: "conflict";
      reason: CentralMemberClaimConflictReason;
      claimedStoreIds: [];
    };

export interface CentralMemberClaimCandidate {
  id: string;
  storeId: string;
  userId: string | null;
  mergedIntoCustomerId: string | null;
  identityLinks: Array<{ userId: string }>;
}

export interface ExistingCentralMemberLink {
  storeId: string;
  customerId: string;
}

export type CentralMemberClaimPlan =
  | { status: "claimable"; candidates: CentralMemberClaimCandidate[] }
  | { status: "nothing_to_claim"; candidates: [] }
  | {
      status: "conflict";
      reason: Exclude<
        CentralMemberClaimConflictReason,
        "invalid_credentials" | "phone_unavailable"
      >;
      candidates: [];
    };

/**
 * Builds a fail-closed claim plan from rows selected by an already verified phone.
 * It never treats a matching phone as proof by itself; the caller must re-check the
 * current central User's password before reading candidates or applying this plan.
 */
export function planCentralMemberClaims(
  userId: string,
  candidates: CentralMemberClaimCandidate[],
  existingLinks: ExistingCentralMemberLink[],
): CentralMemberClaimPlan {
  const active = candidates.filter(
    (candidate) => candidate.mergedIntoCustomerId === null,
  );
  const byStore = new Map<string, CentralMemberClaimCandidate[]>();
  for (const candidate of active) {
    const rows = byStore.get(candidate.storeId) ?? [];
    rows.push(candidate);
    byStore.set(candidate.storeId, rows);
  }

  const claimable: CentralMemberClaimCandidate[] = [];
  for (const [storeId, rows] of byStore) {
    if (rows.length !== 1) {
      return {
        status: "conflict",
        reason: "multiple_customers_in_store",
        candidates: [],
      };
    }

    const candidate = rows[0];
    const linkedCustomerIds = new Set(
      existingLinks
        .filter((link) => link.storeId === storeId)
        .map((link) => link.customerId),
    );
    if (
      linkedCustomerIds.size > 1 ||
      (linkedCustomerIds.size === 1 && !linkedCustomerIds.has(candidate.id))
    ) {
      return {
        status: "conflict",
        reason: "existing_membership_conflict",
        candidates: [],
      };
    }
    if (candidate.userId !== null && candidate.userId !== userId) {
      return {
        status: "conflict",
        reason: "customer_owned_by_another_user",
        candidates: [],
      };
    }
    if (candidate.identityLinks.some((link) => link.userId !== userId)) {
      return {
        status: "conflict",
        reason: "identity_owned_by_another_user",
        candidates: [],
      };
    }

    const alreadyLinked =
      linkedCustomerIds.has(candidate.id) ||
      candidate.identityLinks.some((link) => link.userId === userId);
    if (!alreadyLinked) claimable.push(candidate);
  }

  return claimable.length > 0
    ? { status: "claimable", candidates: claimable }
    : { status: "nothing_to_claim", candidates: [] };
}

/** Re-authenticates the central account, then atomically claims every safe store row. */
export async function claimExistingCustomersByVerifiedPhone(input: {
  userId: string;
  password: string;
}): Promise<CentralMemberClaimResult> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, phone: true, passwordHash: true, role: true, status: true },
  });
  if (
    !user ||
    user.role !== "CUSTOMER" ||
    user.status !== "ACTIVE" ||
    !user.passwordHash ||
    !compareSync(input.password, user.passwordHash)
  ) {
    return { status: "conflict", reason: "invalid_credentials", claimedStoreIds: [] };
  }

  const phone = normalizePhone(user.phone ?? "");
  if (!phone) {
    return { status: "conflict", reason: "phone_unavailable", claimedStoreIds: [] };
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        // Re-read every guard inside the write transaction so a concurrent bind cannot be overwritten.
        const [candidates, existingLinks] = await Promise.all([
          tx.customer.findMany({
            where: { phone, mergedIntoCustomerId: null },
            select: {
              id: true,
              storeId: true,
              userId: true,
              mergedIntoCustomerId: true,
              identityLinks: { select: { userId: true } },
            },
          }),
          tx.customerIdentityLink.findMany({
            where: { userId: user.id },
            select: { storeId: true, customerId: true },
          }),
        ]);
        const plan = planCentralMemberClaims(user.id, candidates, existingLinks);
        if (plan.status === "conflict") {
          return {
            status: "conflict",
            reason: plan.reason,
            claimedStoreIds: [],
          } as const;
        }
        if (plan.status === "nothing_to_claim") {
          return { status: "nothing_to_claim", claimedStoreIds: [] } as const;
        }

        for (const candidate of plan.candidates) {
          const link = await tx.customerIdentityLink.create({
            data: {
              userId: user.id,
              storeId: candidate.storeId,
              customerId: candidate.id,
              provider: "phone",
              providerAccountId: phone,
            },
          });
          await tx.auditLog.create({
            data: {
              actorUserId: user.id,
              targetType: "CustomerIdentityLink",
              targetId: link.id,
              action: "CENTRAL_MEMBER_CLAIM",
              afterJson: { storeId: candidate.storeId, provider: "phone" },
            },
          });
        }

        return {
          status: "claimed",
          claimedStoreIds: plan.candidates
            .map((candidate) => candidate.storeId)
            .sort(),
        } as const;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    // A concurrent claim can win after the in-transaction read. Unique/serialization
    // conflicts must fail closed and never be surfaced as a partial success.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      return {
        status: "conflict",
        reason: "existing_membership_conflict",
        claimedStoreIds: [],
      };
    }
    throw error;
  }
}
