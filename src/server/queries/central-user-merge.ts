import { prisma } from "@/lib/db";

function normalizePhone(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("886") && digits.length === 12) return `0${digits.slice(3)}`;
  return digits.length >= 9 ? digits : null;
}

export async function getCentralUserMergeCandidates() {
  const users = await prisma.user.findMany({
    where: { role: "CUSTOMER", status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      accounts: { select: { provider: true } },
      customerIdentityLinks: { select: { storeId: true, customer: { select: { phone: true, store: { select: { name: true } } } } } },
      customer: { select: { phone: true, storeId: true, store: { select: { name: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  const groups = new Map<string, typeof users>();
  for (const user of users) {
    const phones = new Set<string>();
    const direct = normalizePhone(user.phone);
    if (direct) phones.add(direct);
    const customerPhone = normalizePhone(user.customer?.phone ?? null);
    if (customerPhone) phones.add(customerPhone);
    for (const link of user.customerIdentityLinks) {
      const phone = normalizePhone(link.customer.phone);
      if (phone) phones.add(phone);
    }
    for (const phone of phones) {
      const rows = groups.get(phone) ?? [];
      rows.push(user);
      groups.set(phone, rows);
    }
  }

  return [...groups.entries()]
    .filter(([, rows]) => new Set(rows.map((row) => row.id)).size > 1)
    .map(([phone, rows]) => ({
      phone: `${phone.slice(0, 4)}***${phone.slice(-3)}`,
      users: [...new Map(rows.map((row) => [row.id, row])).values()].map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email ? `${user.email.slice(0, 2)}***@${user.email.split("@")[1] ?? ""}` : null,
        providers: user.accounts.map((account) => account.provider),
        stores: [...new Set([
          ...(user.customer ? [user.customer.store.name] : []),
          ...user.customerIdentityLinks.map((link) => link.customer.store.name),
        ])],
      })),
    }))
    .sort((a, b) => a.phone.localeCompare(b.phone));
}

type MergeAuditPayload = {
  accounts?: number;
  identityLinks?: number;
  directCustomer?: number;
  sourceStatus?: string;
  verification?: {
    operationalDataPreserved?: boolean;
    sourceLoginDisabled?: boolean;
    sourceSessionsCleared?: boolean;
    targetLoginMethods?: number;
    checkedCustomerRecords?: number;
  };
};

export async function getRecentCentralUserMergeReceipts() {
  const rows = await prisma.auditLog.findMany({
    where: { action: "MERGE_CENTRAL_USER", targetType: "User" },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, targetId: true, createdAt: true, afterJson: true },
  });

  return rows.map((row) => {
    const payload = (row.afterJson ?? {}) as MergeAuditPayload;
    const verification = payload.verification;
    const passed = verification?.operationalDataPreserved === true
      && verification.sourceLoginDisabled === true
      && verification.sourceSessionsCleared === true
      && (verification.targetLoginMethods ?? 0) > 0;
    return {
      id: row.id,
      targetUserId: row.targetId,
      createdAt: row.createdAt,
      status: passed ? "PASS" as const : "LEGACY" as const,
      checkedCustomers: verification?.checkedCustomerRecords ?? null,
      targetLoginMethods: verification?.targetLoginMethods ?? null,
      movedAccounts: payload.accounts ?? 0,
      movedLinks: payload.identityLinks ?? 0,
    };
  });
}
