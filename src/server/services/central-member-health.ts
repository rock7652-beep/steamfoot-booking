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

export type CentralMemberResolution =
  | "OTP_REBIND"
  | "MERGE_REVIEW"
  | "MANUAL_REVIEW";

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("886") && digits.length === 12) return `0${digits.slice(3)}`;
  return digits;
}

/**
 * Read-only resolution classifier.  It recommends a lane but never changes an
 * identity. OTP is allowed only when the customer, phone and candidate LINE
 * identity are unique inside the affected store.
 */
export function classifyCentralMemberResolution(
  activeStoreId: string,
  issue: CentralMemberHealthIssue,
  customers: CentralMemberHealthCustomer[],
  links: CentralMemberHealthLink[],
): CentralMemberResolution {
  if (issue.reason === "duplicate_phone" || issue.reason === "multiple_customers_in_store") {
    return "MERGE_REVIEW";
  }
  if (issue.reason !== "line_identity_mismatch" || issue.customerIds.length !== 1) {
    return "MANUAL_REVIEW";
  }

  const customer = customers.find((row) => row.id === issue.customerIds[0]);
  const linkId = issue.id.startsWith("line:") ? issue.id.slice("line:".length) : "";
  const link = links.find((row) => row.id === linkId);
  if (!customer || !link || customer.storeId !== activeStoreId || link.storeId !== activeStoreId) {
    return "MANUAL_REVIEW";
  }
  if (customer.mergedIntoCustomerId !== null || (customer.userId !== null && customer.userId !== link.userId)) {
    return "MANUAL_REVIEW";
  }

  const phone = normalizePhone(customer.phone);
  if (!/^09\d{8}$/.test(phone)) return "MANUAL_REVIEW";
  const samePhoneCustomers = customers.filter(
    (row) => row.storeId === activeStoreId
      && row.mergedIntoCustomerId === null
      && normalizePhone(row.phone) === phone,
  );
  if (samePhoneCustomers.length !== 1) return "MERGE_REVIEW";

  const candidateLineUserId = link.lineUserId ?? link.providerAccountId;
  if (!candidateLineUserId) return "MANUAL_REVIEW";
  const conflictingCustomer = customers.some(
    (row) => row.storeId === activeStoreId
      && row.mergedIntoCustomerId === null
      && row.id !== customer.id
      && row.lineUserId === candidateLineUserId,
  );
  const conflictingLink = links.some(
    (row) => row.storeId === activeStoreId
      && row.id !== link.id
      && row.customerId !== customer.id
      && row.provider === "line"
      && (row.lineUserId ?? row.providerAccountId) === candidateLineUserId,
  );
  return conflictingCustomer || conflictingLink ? "MANUAL_REVIEW" : "OTP_REBIND";
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
