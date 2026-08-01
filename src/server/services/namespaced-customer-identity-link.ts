import {
  CUSTOMER_IDENTITY_PROVIDER,
  isWritableCustomerIdentityProvider,
  type WritableCustomerIdentityProvider,
} from "@/lib/customer-identity-provider";
import { prisma } from "@/lib/db";

type PrismaLike = {
  customer: Pick<typeof prisma.customer, "findUnique">;
  customerIdentityLink: Pick<typeof prisma.customerIdentityLink, "findMany" | "findUnique" | "upsert">;
};

export type NamespacedIdentityLinkError =
  | "LEGACY_PROVIDER_READ_ONLY"
  | "UNSUPPORTED_IDENTITY_PROVIDER"
  | "MISSING_IDENTITY_INPUT"
  | "CUSTOMER_NOT_FOUND"
  | "CUSTOMER_STORE_MISMATCH"
  | "CUSTOMER_ALREADY_MERGED"
  | "CUSTOMER_OWNED_BY_ANOTHER_USER"
  | "IDENTITY_PROVIDER_ACCOUNT_CONFLICT"
  | "CUSTOMER_PROVIDER_CONFLICT"
  | "USER_STORE_PROVIDER_CONFLICT"
  | "LINE_LOGIN_GLOBAL_IDENTITY_CONFLICT"
  | "LINE_LOGIN_CANNOT_WRITE_MESSAGING_ID"
  | "NON_MESSAGING_PROVIDER_CANNOT_WRITE_LINE_ID"
  | "IDENTITY_LINK_WRITE_FAILED";

export type CreateVerifiedCustomerIdentityLinkResult =
  | { status: "upserted" }
  | { status: "error"; error: NamespacedIdentityLinkError };

export interface CreateVerifiedCustomerIdentityLinkInput {
  userId: string;
  storeId: string;
  customerId: string;
  provider: string;
  providerAccountId: string;
  /**
   * Only line_messaging may carry a Messaging API identity here. This API
   * never writes Customer.lineUserId; PR 3 owns that transitional change.
   */
  messagingLineUserId?: string | null;
  tx?: PrismaLike;
}

function validateInput(
  input: CreateVerifiedCustomerIdentityLinkInput,
): NamespacedIdentityLinkError | null {
  if (!input.userId || !input.storeId || !input.customerId || !input.provider || !input.providerAccountId) {
    return "MISSING_IDENTITY_INPUT";
  }
  if (input.provider === CUSTOMER_IDENTITY_PROVIDER.LEGACY_LINE) {
    return "LEGACY_PROVIDER_READ_ONLY";
  }
  if (!isWritableCustomerIdentityProvider(input.provider)) {
    return "UNSUPPORTED_IDENTITY_PROVIDER";
  }
  if (
    input.provider === CUSTOMER_IDENTITY_PROVIDER.LINE_LOGIN &&
    input.messagingLineUserId != null
  ) {
    return "LINE_LOGIN_CANNOT_WRITE_MESSAGING_ID";
  }
  if (
    input.provider !== CUSTOMER_IDENTITY_PROVIDER.LINE_MESSAGING &&
    input.messagingLineUserId != null
  ) {
    return "NON_MESSAGING_PROVIDER_CANNOT_WRITE_LINE_ID";
  }
  return null;
}

/**
 * The only API new code may use to write CustomerIdentityLink namespaces.
 *
 * It deliberately has no Account or Customer.update capability. A LINE Login
 * writer therefore cannot populate Customer.lineUserId, and a Messaging
 * writer cannot create or mutate Account(provider="line") through this API.
 * Existing upsertCustomerIdentityLink remains transitional until PR 2 and PR
 * 3 move their callers to this boundary.
 */
export async function createVerifiedCustomerIdentityLink(
  input: CreateVerifiedCustomerIdentityLinkInput,
): Promise<CreateVerifiedCustomerIdentityLinkResult> {
  const validationError = validateInput(input);
  if (validationError) return { status: "error", error: validationError };

  const provider = input.provider as WritableCustomerIdentityProvider;
  const db = input.tx ?? prisma;
  try {
    const [customer, byProviderAccount, byCustomerProvider, byUserStoreProvider, lineLoginMatches] = await Promise.all([
      db.customer.findUnique({
        where: { id: input.customerId },
        select: { id: true, storeId: true, userId: true, mergedIntoCustomerId: true },
      }),
      db.customerIdentityLink.findUnique({
        where: {
          uq_customer_identity_provider_store: {
            provider,
            providerAccountId: input.providerAccountId,
            storeId: input.storeId,
          },
        },
        select: { userId: true, customerId: true },
      }),
      db.customerIdentityLink.findUnique({
        where: {
          uq_customer_identity_customer_provider: {
            customerId: input.customerId,
            provider,
          },
        },
        select: { userId: true, providerAccountId: true },
      }),
      db.customerIdentityLink.findUnique({
        where: {
          uq_customer_identity_user_store_provider: {
            userId: input.userId,
            storeId: input.storeId,
            provider,
          },
        },
        select: { customerId: true, providerAccountId: true },
      }),
      provider === CUSTOMER_IDENTITY_PROVIDER.LINE_LOGIN
        ? db.customerIdentityLink.findMany({
          where: { provider, providerAccountId: input.providerAccountId },
          select: { userId: true, customerId: true, storeId: true },
        })
        : Promise.resolve([]),
    ]);

    if (!customer) return { status: "error", error: "CUSTOMER_NOT_FOUND" };
    if (customer.storeId !== input.storeId) {
      return { status: "error", error: "CUSTOMER_STORE_MISMATCH" };
    }
    if (customer.mergedIntoCustomerId) return { status: "error", error: "CUSTOMER_ALREADY_MERGED" };
    if (customer.userId && customer.userId !== input.userId) {
      return { status: "error", error: "CUSTOMER_OWNED_BY_ANOTHER_USER" };
    }
    if (
      byProviderAccount &&
      (byProviderAccount.userId !== input.userId || byProviderAccount.customerId !== input.customerId)
    ) return { status: "error", error: "IDENTITY_PROVIDER_ACCOUNT_CONFLICT" };
    if (
      byCustomerProvider &&
      (byCustomerProvider.userId !== input.userId || byCustomerProvider.providerAccountId !== input.providerAccountId)
    ) return { status: "error", error: "CUSTOMER_PROVIDER_CONFLICT" };
    if (
      byUserStoreProvider &&
      (byUserStoreProvider.customerId !== input.customerId || byUserStoreProvider.providerAccountId !== input.providerAccountId)
    ) return { status: "error", error: "USER_STORE_PROVIDER_CONFLICT" };
    if (lineLoginMatches.some((match) =>
      match.userId !== input.userId ||
      match.customerId !== input.customerId ||
      match.storeId !== input.storeId,
    )) return { status: "error", error: "LINE_LOGIN_GLOBAL_IDENTITY_CONFLICT" };

    await db.customerIdentityLink.upsert({
      where: {
        uq_customer_identity_provider_store: {
          provider,
          providerAccountId: input.providerAccountId,
          storeId: input.storeId,
        },
      },
      update: {
        // Pre-flight checks above ensure this is idempotent, never a transfer.
        userId: input.userId,
        customerId: input.customerId,
        lineUserId: input.messagingLineUserId ?? null,
      },
      create: {
        userId: input.userId,
        storeId: input.storeId,
        customerId: input.customerId,
        provider,
        providerAccountId: input.providerAccountId,
        lineUserId: input.messagingLineUserId ?? null,
      },
    });
    return { status: "upserted" };
  } catch {
    return { status: "error", error: "IDENTITY_LINK_WRITE_FAILED" };
  }
}
