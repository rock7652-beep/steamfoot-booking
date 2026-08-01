import { prisma } from "@/lib/db";
import { assertSameStore } from "@/lib/store-consistency";

type PrismaLike = {
  customer: Pick<
    typeof prisma.customer,
    "findUnique"
  >;
  customerIdentityLink: Pick<
    typeof prisma.customerIdentityLink,
    "upsert"
  >;
};

export interface UpsertCustomerIdentityLinkInput {
  userId: string;
  storeId: string;
  customerId: string;
  provider: string;
  providerAccountId: string;
  lineUserId?: string | null;
  tx?: PrismaLike;
}

export type CustomerIdentityLinkSyncResult =
  | { status: "upserted" }
  | { status: "skipped_missing_input" }
  | { status: "error"; error: string };

export async function upsertCustomerIdentityLink(
  input: UpsertCustomerIdentityLinkInput,
): Promise<CustomerIdentityLinkSyncResult> {
  // TRANSITIONAL / DEPRECATED: existing callers may still write provider="line"
  // while PR 2 (LINE Login) and PR 3 (Messaging) move them to
  // createVerifiedCustomerIdentityLink. Do not add new callers here.
  // This function intentionally preserves legacy runtime behavior in PR 1.
  const db = input.tx ?? prisma;
  if (
    !input.userId ||
    !input.storeId ||
    !input.customerId ||
    !input.provider ||
    !input.providerAccountId
  ) {
    return { status: "skipped_missing_input" };
  }

  try {
    const customer = await db.customer.findUnique({
      where: { id: input.customerId },
      select: { id: true, storeId: true, userId: true, mergedIntoCustomerId: true },
    });
    if (!customer) {
      return { status: "error", error: "CUSTOMER_NOT_FOUND" };
    }
    assertSameStore("CustomerIdentityLink.customer", customer.storeId, input.storeId);
    if (customer.mergedIntoCustomerId) {
      return { status: "error", error: "CUSTOMER_ALREADY_MERGED" };
    }
    // CustomerIdentityLink is the cross-store identity truth, but a conflicting
    // legacy Customer.userId would make the central resolver hide this store.
    // Never create that half-linked state. A reviewed identity-consolidation
    // workflow must clear/transfer the legacy owner before retrying.
    if (customer.userId && customer.userId !== input.userId) {
      return { status: "error", error: "CUSTOMER_OWNED_BY_ANOTHER_USER" };
    }

    await db.customerIdentityLink.upsert({
      where: {
        uq_customer_identity_provider_store: {
          provider: input.provider,
          providerAccountId: input.providerAccountId,
          storeId: input.storeId,
        },
      },
      update: {
        userId: input.userId,
        customerId: input.customerId,
        lineUserId: input.lineUserId ?? null,
      },
      create: {
        userId: input.userId,
        storeId: input.storeId,
        customerId: input.customerId,
        provider: input.provider,
        providerAccountId: input.providerAccountId,
        lineUserId: input.lineUserId ?? null,
      },
    });
    return { status: "upserted" };
  } catch (err) {
    console.error("[customerIdentityLink] upsert failed", {
      userId: input.userId,
      storeId: input.storeId,
      customerId: input.customerId,
      provider: input.provider,
      error: err instanceof Error ? err.message : String(err),
    });
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}
