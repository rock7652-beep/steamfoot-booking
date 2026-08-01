import { CUSTOMER_IDENTITY_PROVIDER } from "@/lib/customer-identity-provider";
import { prisma } from "@/lib/db";

type IdentityLinkReader = Pick<typeof prisma.customerIdentityLink, "findUnique">;

export type CustomerIdentityLinkReaderInput = {
  storeId: string;
  providerAccountId: string;
  db?: IdentityLinkReader;
};

async function readIdentity(
  provider: string,
  input: CustomerIdentityLinkReaderInput,
) {
  const db = input.db ?? prisma.customerIdentityLink;
  return db.findUnique({
    where: {
      uq_customer_identity_provider_store: {
        provider,
        providerAccountId: input.providerAccountId,
        storeId: input.storeId,
      },
    },
    select: {
      id: true,
      userId: true,
      customerId: true,
      storeId: true,
      provider: true,
      providerAccountId: true,
      lineUserId: true,
    },
  });
}

export function readLineLoginIdentity(input: CustomerIdentityLinkReaderInput) {
  return readIdentity(CUSTOMER_IDENTITY_PROVIDER.LINE_LOGIN, input);
}

export function readLineMessagingIdentity(input: CustomerIdentityLinkReaderInput) {
  return readIdentity(CUSTOMER_IDENTITY_PROVIDER.LINE_MESSAGING, input);
}

/** Legacy data is deliberately isolated: callers must opt into this reader. */
export function readLegacyLineIdentity(input: CustomerIdentityLinkReaderInput) {
  return readIdentity(CUSTOMER_IDENTITY_PROVIDER.LEGACY_LINE, input);
}
