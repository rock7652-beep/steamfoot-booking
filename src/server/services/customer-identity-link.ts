import { prisma } from "@/lib/db";

type PrismaLike = {
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
