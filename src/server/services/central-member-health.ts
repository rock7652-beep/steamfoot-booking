export type CentralMemberHealthCategory = "PHONE" | "LINE" | "GOOGLE" | "CENTRAL_IDENTITY";
export type CentralMemberHealthSeverity = "REVIEW" | "BLOCKED";

export interface CentralMemberHealthCustomer {
  id: string;
  storeId: string;
  name: string;
  phone: string;
  userId: string | null;
  googleId: string | null;
  lineUserId: string | null;
  mergedIntoCustomerId: string | null;
}

export interface CentralMemberHealthLink {
  id: string;
  storeId: string;
  customerId: string;
  userId: string;
  provider: string;
  providerAccountId: string;
  lineUserId: string | null;
}

export interface CentralMemberHealthIssue {
  id: string;
  category: CentralMemberHealthCategory;
  severity: CentralMemberHealthSeverity;
  reason:
    | "duplicate_phone"
    | "line_identity_mismatch"
    | "google_identity_mismatch"
    | "link_store_mismatch"
    | "merged_customer"
    | "customer_linked_to_another_user"
    | "multiple_customers_in_store";
  customerIds: string[];
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("886") && digits.length === 12) return `0${digits.slice(3)}`;
  return digits;
}

/**
 * Pure, read-only health classifier. It never infers ownership or mutates links.
 * Only deterministic conflicts are returned; same-name rows are deliberately
 * excluded because two people in one store can legitimately share a name.
 */
export function detectCentralMemberHealthIssues(
  activeStoreId: string,
  customers: CentralMemberHealthCustomer[],
  links: CentralMemberHealthLink[],
): CentralMemberHealthIssue[] {
  const issues: CentralMemberHealthIssue[] = [];
  const customerById = new Map(customers.map((customer) => [customer.id, customer] as const));
  const activeStoreCustomers = customers.filter(
    (customer) => customer.storeId === activeStoreId && customer.mergedIntoCustomerId === null,
  );

  const phoneGroups = new Map<string, CentralMemberHealthCustomer[]>();
  for (const customer of activeStoreCustomers) {
    const phone = normalizePhone(customer.phone);
    if (!phone) continue;
    const rows = phoneGroups.get(phone) ?? [];
    rows.push(customer);
    phoneGroups.set(phone, rows);
  }
  for (const [phone, rows] of phoneGroups) {
    if (rows.length < 2) continue;
    issues.push({
      id: `phone:${phone}`,
      category: "PHONE",
      severity: "REVIEW",
      reason: "duplicate_phone",
      customerIds: rows.map((row) => row.id).sort(),
    });
  }

  const relevantLinks = links.filter((link) => {
    const customer = customerById.get(link.customerId);
    return link.storeId === activeStoreId || customer?.storeId === activeStoreId;
  });

  for (const link of relevantLinks) {
    const customer = customerById.get(link.customerId);
    if (!customer || customer.storeId !== link.storeId) {
      issues.push({
        id: `central:store:${link.id}`,
        category: "CENTRAL_IDENTITY",
        severity: "BLOCKED",
        reason: "link_store_mismatch",
        customerIds: customer ? [customer.id] : [],
      });
      continue;
    }
    if (customer.mergedIntoCustomerId !== null) {
      issues.push({
        id: `central:merged:${link.id}`,
        category: "CENTRAL_IDENTITY",
        severity: "BLOCKED",
        reason: "merged_customer",
        customerIds: [customer.id],
      });
      continue;
    }
    if (customer.userId !== null && customer.userId !== link.userId) {
      issues.push({
        id: `central:user:${link.id}`,
        category: "CENTRAL_IDENTITY",
        severity: "BLOCKED",
        reason: "customer_linked_to_another_user",
        customerIds: [customer.id],
      });
    }
    if (
      link.provider === "line" &&
      customer.lineUserId !== null &&
      customer.lineUserId !== (link.lineUserId ?? link.providerAccountId)
    ) {
      issues.push({
        id: `line:${link.id}`,
        category: "LINE",
        severity: "BLOCKED",
        reason: "line_identity_mismatch",
        customerIds: [customer.id],
      });
    }
    if (
      link.provider === "google" &&
      customer.googleId !== null &&
      customer.googleId !== link.providerAccountId
    ) {
      issues.push({
        id: `google:${link.id}`,
        category: "GOOGLE",
        severity: "BLOCKED",
        reason: "google_identity_mismatch",
        customerIds: [customer.id],
      });
    }
  }

  const userStoreCustomers = new Map<string, Set<string>>();
  for (const link of relevantLinks) {
    if (link.storeId !== activeStoreId) continue;
    const key = `${link.userId}:${link.storeId}`;
    const customerIds = userStoreCustomers.get(key) ?? new Set<string>();
    customerIds.add(link.customerId);
    userStoreCustomers.set(key, customerIds);
  }
  for (const [key, customerIds] of userStoreCustomers) {
    if (customerIds.size < 2) continue;
    issues.push({
      id: `central:multiple:${key}`,
      category: "CENTRAL_IDENTITY",
      severity: "BLOCKED",
      reason: "multiple_customers_in_store",
      customerIds: [...customerIds].sort(),
    });
  }

  return issues.sort((a, b) => a.id.localeCompare(b.id));
}
