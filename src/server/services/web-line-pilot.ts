import { prisma } from "@/lib/db";
import { resolveStoreFromOAuthCookie } from "@/lib/store-resolver";

/** Server-only rollout restriction applied after LINE verifies the identity. */
export async function allowWebLinePilot(subject: string): Promise<boolean> {
  const mode = process.env.WEB_LINE_LOGIN_MODE?.trim();
  if (mode === "all") return true;
  if (!mode && process.env.VERCEL_ENV !== "production") return true;
  if (mode !== "pilot") return false;
  const userId = process.env.WEB_LINE_LOGIN_PILOT_USER_ID?.trim();
  const storeId = process.env.WEB_LINE_LOGIN_PILOT_STORE_ID?.trim();
  if (!subject || !userId || !storeId) return false;
  const store = await resolveStoreFromOAuthCookie();
  if (store?.storeId !== storeId) return false;
  const link = await prisma.customerIdentityLink.findUnique({
    where: { uq_customer_identity_provider_store: {
      provider: "line", providerAccountId: subject, storeId,
    } },
    include: { user: true, customer: true },
  });
  return !!link && link.userId === userId && link.user.id === userId &&
    link.user.role === "CUSTOMER" && link.user.status === "ACTIVE" &&
    link.customer.storeId === storeId &&
    link.customer.mergedIntoCustomerId === null &&
    (link.customer.userId === null || link.customer.userId === userId);
}
