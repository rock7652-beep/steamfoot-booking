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
