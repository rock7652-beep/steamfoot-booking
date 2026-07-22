import { prisma } from "@/lib/db";
import {
  resolveCentralLineRecipient,
  type CentralLineRecipientResolution,
} from "@/server/services/central-line-recipient";

const recipientSelect = {
  id: true,
  userId: true,
  lineUserId: true,
  user: {
    select: {
      id: true,
      status: true,
      accounts: { select: { provider: true, providerAccountId: true } },
    },
  },
  identityLinks: {
    select: {
      userId: true,
      provider: true,
      providerAccountId: true,
      lineUserId: true,
      user: {
        select: {
          id: true,
          status: true,
          accounts: { select: { provider: true, providerAccountId: true } },
        },
      },
    },
  },
} as const;

type RecipientCustomer = Awaited<ReturnType<typeof loadRecipientCustomer>>;

async function loadRecipientCustomer(customerId: string, storeId?: string) {
  return prisma.customer.findFirst({
    where: { id: customerId, ...(storeId ? { storeId } : {}) },
    select: recipientSelect,
  });
}

export async function resolveCentralLineRecipientForCustomer(
  customerId: string,
  storeId?: string,
): Promise<CentralLineRecipientResolution | null> {
  const customer = await loadRecipientCustomer(customerId, storeId);
  return customer ? resolveLoadedCustomer(customer) : null;
}

export async function resolveCentralLineRecipientsForCustomers(
  customerIds: string[],
): Promise<Map<string, CentralLineRecipientResolution>> {
  if (customerIds.length === 0) return new Map();
  const customers = await prisma.customer.findMany({
    where: { id: { in: [...new Set(customerIds)] } },
    select: recipientSelect,
  });
  return new Map(customers.map((customer) => [customer.id, resolveLoadedCustomer(customer)]));
}

function resolveLoadedCustomer(customer: NonNullable<RecipientCustomer>) {
  const users = new Map<string, NonNullable<typeof customer.user>>();
  if (customer.user) users.set(customer.user.id, customer.user);
  for (const link of customer.identityLinks) users.set(link.user.id, link.user);
  return resolveCentralLineRecipient({
    customerId: customer.id,
    directUserId: customer.userId,
    legacyLineUserId: customer.lineUserId,
    identityLinks: customer.identityLinks.map((link) => ({
      userId: link.userId,
      provider: link.provider,
      providerAccountId: link.providerAccountId,
      lineUserId: link.lineUserId,
    })),
    users: [...users.values()],
  });
}
