export interface CentralMemberCustomerRow {
  id: string;
  storeId: string;
  phone: string;
  userId: string | null;
  mergedIntoCustomerId: string | null;
}

export interface CentralMemberIdentityLinkRow {
  customerId: string;
  storeId: string;
  userId: string;
  provider: string;
}

export interface CentralMemberReadinessSummary {
  activeCustomers: number;
  customersWithVerifiedLoginLink: number;
  customersWithoutVerifiedLoginLink: number;
  centralUsersAcrossMultipleStores: number;
  crossStorePhoneCandidateGroups: number;
  crossStorePhoneConflictGroups: number;
  invalidStoreLinkCount: number;
  providerLinks: Record<string, number>;
}

/**
 * Produces aggregate-only readiness metrics for central membership.
 *
 * Security contract:
 * - userId / an existing CustomerIdentityLink is verified identity evidence.
 * - matching phone numbers are review candidates only; they never become an
 *   automatic link because phone knowledge alone cannot prove ownership.
 * - merged source Customers are excluded from the active population.
 * - no raw phone, Customer id, User id, or provider account id is returned.
 */
export function summarizeCentralMemberReadiness(
  customers: CentralMemberCustomerRow[],
  links: CentralMemberIdentityLinkRow[],
): CentralMemberReadinessSummary {
  const activeCustomers = customers.filter((row) => !row.mergedIntoCustomerId);
  const activeById = new Map(activeCustomers.map((row) => [row.id, row] as const));
  const validLinks = links.filter((link) => {
    const customer = activeById.get(link.customerId);
    return customer != null && customer.storeId === link.storeId;
  });
  const linkedCustomerIds = new Set(validLinks.map((link) => link.customerId));

  const userStores = new Map<string, Set<string>>();
  const providerLinks: Record<string, number> = {};
  for (const link of validLinks) {
    const stores = userStores.get(link.userId) ?? new Set<string>();
    stores.add(link.storeId);
    userStores.set(link.userId, stores);
    providerLinks[link.provider] = (providerLinks[link.provider] ?? 0) + 1;
  }

  const phoneGroups = new Map<string, CentralMemberCustomerRow[]>();
  for (const customer of activeCustomers) {
    const phone = customer.phone.trim();
    if (!phone) continue;
    const rows = phoneGroups.get(phone) ?? [];
    rows.push(customer);
    phoneGroups.set(phone, rows);
  }

  let crossStorePhoneCandidateGroups = 0;
  let crossStorePhoneConflictGroups = 0;
  for (const rows of phoneGroups.values()) {
    if (new Set(rows.map((row) => row.storeId)).size < 2) continue;
    crossStorePhoneCandidateGroups += 1;
    const userIds = new Set(rows.map((row) => row.userId).filter(Boolean));
    if (userIds.size > 1) crossStorePhoneConflictGroups += 1;
  }

  return {
    activeCustomers: activeCustomers.length,
    customersWithVerifiedLoginLink: linkedCustomerIds.size,
    customersWithoutVerifiedLoginLink: activeCustomers.length - linkedCustomerIds.size,
    centralUsersAcrossMultipleStores: [...userStores.values()].filter(
      (stores) => stores.size > 1,
    ).length,
    crossStorePhoneCandidateGroups,
    crossStorePhoneConflictGroups,
    invalidStoreLinkCount: links.length - validLinks.length,
    providerLinks,
  };
}
