import { prisma } from "@/lib/db";

const centralUserSelect = {
  id: true,
  name: true,
  email: true,
  passwordHash: true,
  role: true,
  status: true,
} as const;

export type CentralUserResolution =
  | {
      status: "resolved";
      source: "customer_user" | "identity_link";
      customer: {
        id: string;
        storeId: string;
        store: { slug: string };
        hasDirectUser: boolean;
      };
      user: {
        id: string;
        name: string;
        email: string | null;
        passwordHash: string | null;
        role: string;
        status: string;
      };
    }
  | { status: "not_found" }
  | { status: "identity_conflict" };

/**
 * Resolve the one central User that owns a store-scoped Customer.
 *
 * Customer.userId remains the legacy one-to-one shortcut. For additional
 * stores, CustomerIdentityLink is the ownership truth. Every identity link for
 * the Customer must converge on the same User; otherwise fail closed instead
 * of choosing a provider or row arbitrarily.
 */
export async function resolveCentralUserForStoreCustomer(input: {
  customerId?: string;
  storeId: string;
  phone?: string;
}): Promise<CentralUserResolution> {
  const customer = await prisma.customer.findFirst({
    where: {
      ...(input.customerId ? { id: input.customerId } : { phone: input.phone }),
      storeId: input.storeId,
      mergedIntoCustomerId: null,
    },
    select: {
      id: true,
      storeId: true,
      store: { select: { slug: true } },
      user: { select: centralUserSelect },
      identityLinks: {
        select: { user: { select: centralUserSelect } },
      },
    },
  });

  if (!customer) return { status: "not_found" };

  const linkedUsers = new Map(
    customer.identityLinks.map(({ user }) => [user.id, user]),
  );

  if (customer.user) {
    for (const linkedUserId of linkedUsers.keys()) {
      if (linkedUserId !== customer.user.id) {
        return { status: "identity_conflict" };
      }
    }
    return {
      status: "resolved",
      source: "customer_user",
      customer: {
        id: customer.id,
        storeId: customer.storeId,
        store: customer.store,
        hasDirectUser: true,
      },
      user: customer.user,
    };
  }

  if (linkedUsers.size !== 1) {
    return linkedUsers.size === 0
      ? { status: "not_found" }
      : { status: "identity_conflict" };
  }

  const user = [...linkedUsers.values()][0];
  return {
    status: "resolved",
    source: "identity_link",
    customer: {
      id: customer.id,
      storeId: customer.storeId,
      store: customer.store,
      hasDirectUser: false,
    },
    user,
  };
}
