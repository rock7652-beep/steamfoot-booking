import { prisma } from "@/lib/db";
import {
  getNativeHealthSummary,
  getNativeHealthSummaryForMemberships,
} from "@/lib/native-health-service";
import { resolveCentralMembershipsForUser } from "@/server/services/central-member-resolver";
import { resolveCentralUserForStoreCustomer } from "@/server/services/resolve-central-user-for-store-customer";

export async function hasActiveCustomerHealthHistoryGrant(input: {
  userId: string;
  targetStoreId: string;
  targetCustomerId: string;
}): Promise<boolean> {
  const grant = await prisma.customerHealthHistoryGrant.findFirst({
    where: { ...input, revokedAt: null },
    select: { id: true },
  });
  return grant !== null;
}

/**
 * Resolve the summary visible to staff for one store-scoped customer.
 *
 * Without an active consent row this is deliberately a single-store query.
 * With consent, central membership resolution is repeated at read time so a
 * removed/conflicting identity link immediately fails closed.
 */
export async function getStaffVisibleHealthSummary(input: {
  targetStoreId: string;
  targetCustomerId: string;
}) {
  const localSummary = () =>
    getNativeHealthSummary(input.targetCustomerId, input.targetStoreId);
  const owner = await resolveCentralUserForStoreCustomer({
    customerId: input.targetCustomerId,
    storeId: input.targetStoreId,
  });
  if (owner.status !== "resolved") {
    return { summary: await localSummary(), hasCrossStoreGrant: false, storeCount: 1 };
  }

  const activeGrant = await hasActiveCustomerHealthHistoryGrant({
    userId: owner.user.id,
    targetStoreId: input.targetStoreId,
    targetCustomerId: input.targetCustomerId,
  });
  if (!activeGrant) {
    return { summary: await localSummary(), hasCrossStoreGrant: false, storeCount: 1 };
  }

  const resolved = await resolveCentralMembershipsForUser(owner.user.id);
  const memberships = resolved.memberships.map((membership) => ({
    storeId: membership.storeId,
    customerId: membership.customerId,
    storeName: membership.storeName,
    storeSlug: membership.storeSlug,
  }));
  const targetStillVerified = memberships.some(
    (membership) =>
      membership.storeId === input.targetStoreId &&
      membership.customerId === input.targetCustomerId,
  );
  if (!targetStillVerified || memberships.length < 2) {
    return { summary: await localSummary(), hasCrossStoreGrant: false, storeCount: 1 };
  }

  return {
    summary: await getNativeHealthSummaryForMemberships(memberships),
    hasCrossStoreGrant: true,
    storeCount: memberships.length,
  };
}
