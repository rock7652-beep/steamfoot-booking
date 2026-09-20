import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/normalize";
import { resolveVerifiedLineCustomer } from "./verified-line-customer";

/** The caller must verify the LINE token and course store before calling.
 * Existing identities are never reassigned by registration. All new rows are
 * committed together, including Account and the store membership link.
 */
export async function onboardCourseLineMember(input: {
  storeId: string; lineUserId: string; name: string; phone: string;
  lineName: string | null; identityProvider?: string;
}): Promise<{ status: "ok" | "invalid_phone" | "identity_review_required" | "service_unavailable" }> {
  const identityProvider = input.identityProvider ?? "line";
  const phone = normalizePhone(input.phone);
  if (!/^09\d{8}$/.test(phone)) return { status: "invalid_phone" };
  if (await resolveVerifiedLineCustomer(input.storeId, input.lineUserId, { identityProvider })) return { status: "ok" };

  try {
    return await prisma.$transaction(async (tx) => {
      const account = await tx.account.findUnique({
        where: { provider_providerAccountId: { provider: identityProvider, providerAccountId: input.lineUserId } },
        select: { userId: true, user: { select: { status: true } } },
      });
      const candidates = await tx.customer.findMany({
        where: { storeId: input.storeId, OR: [{ phone }, ...(identityProvider === "line" ? [{ lineUserId: input.lineUserId }] : [])] },
        select: { id: true }, take: 2,
      });
      const links = await tx.customerIdentityLink.findMany({
        where: { storeId: input.storeId, OR: [
          { provider: identityProvider, providerAccountId: input.lineUserId },
          ...(account ? [{ userId: account.userId }] : []),
        ] }, select: { id: true }, take: 1,
      });
      const legacyMember = account ? await tx.customer.findFirst({
        where: { storeId: input.storeId, userId: account.userId }, select: { id: true },
      }) : null;
      // Matching a supplied name/phone is not authorization to take a record.
      if (candidates.length || links.length || legacyMember || (account && account.user.status !== "ACTIVE")) {
        return { status: "identity_review_required" as const };
      }
      const userId = account?.userId ?? (await tx.user.create({
        data: { name: input.name, phone, role: "CUSTOMER", status: "ACTIVE" },
        select: { id: true },
      })).id;
      if (!account) await tx.account.create({ data: {
        userId, provider: identityProvider, providerAccountId: input.lineUserId, type: "oauth",
      } });
      const customer = await tx.customer.create({ data: {
        storeId: input.storeId, name: input.name, phone,
        // Customer.userId is globally unique. A central account can have a
        // different legacy customer; the scoped identity link is authoritative.
        userId: account ? null : userId,
        authSource: "LINE", lineUserId: identityProvider === "line" ? input.lineUserId : null,
        lineName: input.lineName ?? input.name, lineLinkStatus: "LINKED",
        lineLinkedAt: new Date(), customerStage: "LEAD",
      }, select: { id: true } });
      await tx.customerIdentityLink.create({ data: {
        userId, storeId: input.storeId, customerId: customer.id,
        provider: identityProvider, providerAccountId: input.lineUserId, lineUserId: input.lineUserId,
      } });
      return { status: "ok" as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    // Unique/serialization races roll back every new row; never return a
    // successful registration after a best-effort Account sync failure.
    const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "UNKNOWN";
    console.warn("[course-line-onboarding] transaction_failed", { code });
    return { status: "service_unavailable" };
  }
}
