import {
  getNativeHealthSummary,
  getNativeHealthSummaryForMemberships,
} from "@/lib/native-health-service";
import { resolveCentralMembershipsForUser } from "@/server/services/central-member-resolver";
import { resolveCentralUserForStoreCustomer } from "@/server/services/resolve-central-user-for-store-customer";

const CROSS_STORE_HEALTH_MANAGER_ROLES = new Set(["ADMIN", "OWNER", "PARTNER"]);

/**
 * Resolve the health summary visible to a manager for one store-scoped customer.
 *
 * Managers can see unified history only when the central identity resolver still
 * confirms that the customer has a verified membership in the manager's current
 * store. Name and phone are never used to infer cross-store identity. Every
 * health record keeps its original storeId and the store-wide overview remains
 * store-scoped.
 */
export async function getStaffVisibleHealthSummary(input: {
  staffRole: string;
  targetStoreId: string;
  targetCustomerId: string;
}) {
  const localSummary = () =>
    getNativeHealthSummary(input.targetCustomerId, input.targetStoreId);

  if (!CROSS_STORE_HEALTH_MANAGER_ROLES.has(input.staffRole)) {
    return { summary: await localSummary(), hasCrossStoreAccess: false, storeCount: 1 };
  }

  const owner = await resolveCentralUserForStoreCustomer({
    customerId: input.targetCustomerId,
    storeId: input.targetStoreId,
  });
  if (owner.status !== "resolved") {
    return { summary: await localSummary(), hasCrossStoreAccess: false, storeCount: 1 };
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
    return { summary: await localSummary(), hasCrossStoreAccess: false, storeCount: 1 };
  }

  return {
    summary: await getNativeHealthSummaryForMemberships(memberships),
    hasCrossStoreAccess: true,
    storeCount: memberships.length,
  };
}
