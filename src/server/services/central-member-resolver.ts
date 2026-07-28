import { prisma } from "@/lib/db";

export interface CentralMemberLinkRow {
  id: string;
  userId: string;
  storeId: string;
  provider: string;
  customer: {
    id: string;
    name: string;
    userId: string | null;
    storeId: string;
    mergedIntoCustomerId: string | null;
    store: {
      id: string;
      name: string;
      slug: string;
      operatingStatus: string;
    };
  };
}

export interface CentralMemberStoreMembership {
  userId: string;
  storeId: string;
  storeName: string;
  storeSlug: string;
  storeOperatingStatus: string;
  customerId: string;
  customerName: string;
  providers: string[];
}

export type CentralMemberConflictReason =
  | "link_store_mismatch"
  | "merged_customer"
  | "customer_linked_to_another_user"
  | "multiple_customers_in_store";

export interface CentralMemberConflict {
  storeId: string;
  reason: CentralMemberConflictReason;
}

export interface CentralMemberResolution {
  memberships: CentralMemberStoreMembership[];
  conflicts: CentralMemberConflict[];
}

/**
 * Converts verified CustomerIdentityLink rows into central memberships.
 *
 * Fail-closed rules:
 * - phone/name/email are deliberately absent and can never create membership;
 * - merged customers and store drift are rejected;
 * - a legacy Customer.userId owned by another User is rejected;
 * - providers must agree on exactly one Customer inside each store.
 */
export function resolveCentralMemberLinks(
  userId: string,
  links: CentralMemberLinkRow[],
): CentralMemberResolution {
  const memberships: CentralMemberStoreMembership[] = [];
  const conflicts: CentralMemberConflict[] = [];
  const linksByStore = new Map<string, CentralMemberLinkRow[]>();

  for (const link of links) {
    const storeLinks = linksByStore.get(link.storeId) ?? [];
    storeLinks.push(link);
    linksByStore.set(link.storeId, storeLinks);
  }

  for (const [storeId, storeLinks] of linksByStore) {
    if (
      storeLinks.some(
        (link) =>
          link.userId !== userId ||
          link.customer.storeId !== storeId ||
          link.customer.store.id !== storeId,
      )
    ) {
      conflicts.push({ storeId, reason: "link_store_mismatch" });
      continue;
    }

    if (storeLinks.some((link) => link.customer.mergedIntoCustomerId !== null)) {
      conflicts.push({ storeId, reason: "merged_customer" });
      continue;
    }

    if (
      storeLinks.some(
        (link) => link.customer.userId !== null && link.customer.userId !== userId,
      )
    ) {
      conflicts.push({ storeId, reason: "customer_linked_to_another_user" });
      continue;
    }

    const customerIds = new Set(storeLinks.map((link) => link.customer.id));
    if (customerIds.size !== 1) {
      conflicts.push({ storeId, reason: "multiple_customers_in_store" });
      continue;
    }

    const first = storeLinks[0];
    memberships.push({
      userId,
      storeId,
      storeName: first.customer.store.name,
      storeSlug: first.customer.store.slug,
      storeOperatingStatus: first.customer.store.operatingStatus,
      customerId: first.customer.id,
      customerName: first.customer.name,
      providers: [...new Set(storeLinks.map((link) => link.provider))].sort(),
    });
  }

  return {
    memberships: memberships.sort((a, b) => a.storeSlug.localeCompare(b.storeSlug)),
    conflicts: conflicts.sort((a, b) => a.storeId.localeCompare(b.storeId)),
  };
}

export async function resolveCentralMembershipsForUser(
  userId: string,
): Promise<CentralMemberResolution> {
  const [links, legacyCustomers, approvedUnlinks] = await Promise.all([
    prisma.customerIdentityLink.findMany({
      where: { userId },
      select: {
        id: true,
        userId: true,
        storeId: true,
        provider: true,
        customer: {
          select: {
            id: true,
            name: true,
            userId: true,
            storeId: true,
            mergedIntoCustomerId: true,
            store: {
              select: {
                id: true,
                name: true,
                slug: true,
                operatingStatus: true,
              },
            },
          },
        },
      },
    }),
    prisma.customer.findMany({
      where: {
        userId,
        mergedIntoCustomerId: null,
      },
      select: {
        id: true,
        name: true,
        storeId: true,
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
            operatingStatus: true,
          },
        },
      },
    }),
    prisma.centralMemberLinkReviewRequest.findMany({
      where: {
        userId,
        type: "UNLINK_REQUEST",
        status: "APPROVED",
      },
      select: { storeId: true, customerId: true },
    }),
  ]);

  const resolved = resolveCentralMemberLinks(userId, links);
  const linkedStoreIds = new Set(resolved.memberships.map((membership) => membership.storeId));
  const conflictedStoreIds = new Set(resolved.conflicts.map((conflict) => conflict.storeId));
  const approvedUnlinkKeys = new Set(
    approvedUnlinks.map((request) => `${request.storeId}:${request.customerId}`),
  );
  const legacyByStore = new Map<string, typeof legacyCustomers>();

  for (const customer of legacyCustomers) {
    if (linkedStoreIds.has(customer.storeId) || conflictedStoreIds.has(customer.storeId)) continue;
    if (approvedUnlinkKeys.has(`${customer.storeId}:${customer.id}`)) continue;
    const storeCustomers = legacyByStore.get(customer.storeId) ?? [];
    storeCustomers.push(customer);
    legacyByStore.set(customer.storeId, storeCustomers);
  }

  for (const [storeId, customers] of legacyByStore) {
    if (customers.length !== 1) {
      resolved.conflicts.push({ storeId, reason: "multiple_customers_in_store" });
      continue;
    }

    const customer = customers[0];
    if (customer.store.id !== storeId) {
      resolved.conflicts.push({ storeId, reason: "link_store_mismatch" });
      continue;
    }

    resolved.memberships.push({
      userId,
      storeId,
      storeName: customer.store.name,
      storeSlug: customer.store.slug,
      storeOperatingStatus: customer.store.operatingStatus,
      customerId: customer.id,
      customerName: customer.name,
      providers: ["legacy_user_id"],
    });
  }

  resolved.memberships.sort((a, b) => a.storeSlug.localeCompare(b.storeSlug));
  resolved.conflicts.sort((a, b) => a.storeId.localeCompare(b.storeId));
  return resolved;
}

export async function resolveCentralMemberCustomerForStore(
  userId: string,
  storeId: string,
): Promise<CentralMemberStoreMembership | null> {
  const resolved = await resolveCentralMembershipsForUser(userId);
  return resolved.memberships.find((membership) => membership.storeId === storeId) ?? null;
}
