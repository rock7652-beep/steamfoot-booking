import { prisma } from "@/lib/db";
import { resolveCentralMemberCustomerForStore } from "./central-member-resolver";

import { LineIdentityReviewError } from "./line-identity-review";

const customerSelect = {
  id: true, name: true, lineName: true, userId: true, storeId: true,
  mergedIntoCustomerId: true, store: { select: { slug: true } },
} as const;
const userSelect = { id: true, name: true, email: true, role: true, status: true } as const;

/** Input LINE subject must already be verified against the configured channel.
 * Shared by exchange and credentials: no phone/name or stale-cookie fallback.
 * A verified central Account may access only its confirmed store membership.
 */
export async function resolveVerifiedLineCustomer(storeId: string, lineUserId: string, options: { explainFailure?: boolean } = {}) {
  const reject = (reason: string) => {
    if (options.explainFailure) throw new LineIdentityReviewError(reason);
    return null;
  };
  const [link, account] = await Promise.all([
    prisma.customerIdentityLink.findUnique({
      where: { uq_customer_identity_provider_store: {
        provider: "line", providerAccountId: lineUserId, storeId,
      } },
      select: { userId: true, customer: { select: customerSelect } },
    }),
    prisma.account.findUnique({
      where: { provider_providerAccountId: { provider: "line", providerAccountId: lineUserId } },
      select: { userId: true },
    }),
  ]);
  if (link && account && link.userId !== account.userId) return reject("account_owner_conflict");
  let customer = link?.customer ?? null;
  let userId = link?.userId ?? account?.userId ?? null;
  if (!customer && userId) {
    const member = await resolveCentralMemberCustomerForStore(userId, storeId);
    if (!member) return reject("store_membership_unconfirmed");
    customer = await prisma.customer.findUnique({ where: { id: member.customerId }, select: customerSelect });
  }
  if (!customer && !userId) {
    // Preserve unambiguous legacy identities; never pick an arbitrary duplicate.
    const rows = await prisma.customer.findMany({
      where: { storeId, lineUserId, mergedIntoCustomerId: null },
      select: customerSelect, take: 2,
    });
    if (rows.length > 1) return reject("ambiguous_legacy_identity");
    if (rows.length === 0) return null;
    customer = rows[0];
    userId = customer.userId;
  }
  if (customer && !userId && !link && !account) return null;
  if (!customer || !userId || customer.storeId !== storeId || customer.mergedIntoCustomerId ||
      (customer.userId !== null && customer.userId !== userId)) return reject("customer_owner_conflict");
  const member = await resolveCentralMemberCustomerForStore(userId, storeId);
  if (!member || member.customerId !== customer.id) return reject("store_membership_conflict");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: userSelect });
  // A central account may also be an OWNER/PARTNER.  LIFF is a member-context
  // session, so store membership (not the account's dashboard role) is the
  // authorization boundary.  The credentials provider deliberately mints a
  // CUSTOMER-context session without mutating the persisted role.
  if (!user || user.status !== "ACTIVE") return reject("account_unavailable");
  return { ...customer, userId, user };
}
