import { prisma } from "@/lib/db";
import { resolveCentralMemberCustomerForStore } from "./central-member-resolver";

const customerSelect = {
  id: true, name: true, lineName: true, userId: true, storeId: true,
  mergedIntoCustomerId: true, store: { select: { slug: true } },
} as const;
const userSelect = { id: true, name: true, email: true, role: true, status: true } as const;

/** Input LINE subject must already be verified against the configured channel.
 * Shared by exchange and credentials: no phone/name or stale-cookie fallback.
 * A verified central Account may access only its confirmed store membership.
 */
export async function resolveVerifiedLineCustomer(storeId: string, lineUserId: string) {
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
  if (link && account && link.userId !== account.userId) return null;
  let customer = link?.customer ?? null;
  let userId = link?.userId ?? account?.userId ?? null;
  if (!customer && userId) {
    const member = await resolveCentralMemberCustomerForStore(userId, storeId);
    if (!member) return null;
    customer = await prisma.customer.findUnique({ where: { id: member.customerId }, select: customerSelect });
  }
  if (!customer && !userId) {
    // Preserve unambiguous legacy identities; never pick an arbitrary duplicate.
    const rows = await prisma.customer.findMany({
      where: { storeId, lineUserId, mergedIntoCustomerId: null },
      select: customerSelect, take: 2,
    });
    if (rows.length !== 1) return null;
    customer = rows[0];
    userId = customer.userId;
  }
  if (!customer || !userId || customer.storeId !== storeId || customer.mergedIntoCustomerId ||
      (customer.userId !== null && customer.userId !== userId)) return null;
  const member = await resolveCentralMemberCustomerForStore(userId, storeId);
  if (!member || member.customerId !== customer.id) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: userSelect });
  if (!user || user.role !== "CUSTOMER" || user.status !== "ACTIVE") return null;
  return { ...customer, userId, user };
}
