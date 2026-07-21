import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/normalize";

export type CentralMemberClaimConflictReason =
  | "line_identity_required"
  | "phone_mismatch"
  | "current_membership_unverified"
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
        "line_identity_required" | "phone_mismatch" | "current_membership_unverified" | "phone_unavailable"
      >;
      candidates: [];
    };

/**
 * Builds a fail-closed claim plan from rows selected by an already verified phone.
 * It never treats a matching phone as proof by itself. The caller must first verify
 * an existing LINE identity and the phone on the current, already linked membership.
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

export function verifyLinePhoneClaimEvidence(input: {
  enteredPhone: string;
  userPhone: string | null;
  currentCustomerPhone: string | null;
  hasLineAccount: boolean;
  currentMembershipBelongsToUser: boolean;
}): CentralMemberClaimConflictReason | null {
  if (!input.hasLineAccount) return "line_identity_required";
  if (!input.currentMembershipBelongsToUser) return "current_membership_unverified";

  const enteredPhone = normalizePhone(input.enteredPhone);
  const userPhone = normalizePhone(input.userPhone ?? "");
  const currentCustomerPhone = normalizePhone(input.currentCustomerPhone ?? "");
  if (!enteredPhone || !userPhone || !currentCustomerPhone) return "phone_unavailable";
  if (enteredPhone !== userPhone || enteredPhone !== currentCustomerPhone) {
    return "phone_mismatch";
  }
  return null;
}

/** Verifies LINE + the current membership phone, then atomically claims safe store rows. */
export async function claimExistingCustomersByLineAndPhone(input: {
  userId: string;
  currentCustomerId: string;
  enteredPhone: string;
}): Promise<CentralMemberClaimResult> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      phone: true,
      role: true,
      status: true,
      accounts: { where: { provider: "line" }, select: { id: true }, take: 1 },
    },
  });
  if (!user || user.role !== "CUSTOMER" || user.status !== "ACTIVE") {
    return { status: "conflict", reason: "current_membership_unverified", claimedStoreIds: [] };
  }

  const currentCustomer = await prisma.customer.findUnique({
    where: { id: input.currentCustomerId },
    select: {
      phone: true,
      userId: true,
      mergedIntoCustomerId: true,
      identityLinks: { where: { userId: user.id }, select: { id: true }, take: 1 },
    },
  });
  const evidenceError = verifyLinePhoneClaimEvidence({
    enteredPhone: input.enteredPhone,
    userPhone: user.phone,
    currentCustomerPhone: currentCustomer?.phone ?? null,
    hasLineAccount: user.accounts.length > 0,
    currentMembershipBelongsToUser: !!currentCustomer &&
      currentCustomer.mergedIntoCustomerId === null &&
      (currentCustomer.userId === user.id || currentCustomer.identityLinks.length > 0),
  });
  if (evidenceError) {
    return { status: "conflict", reason: evidenceError, claimedStoreIds: [] };
  }
  const phone = normalizePhone(input.enteredPhone)!;

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
