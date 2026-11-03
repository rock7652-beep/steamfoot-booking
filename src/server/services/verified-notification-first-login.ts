import "server-only";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/normalize";

/** Internal: call only after verifying a fresh token against the store's LINE
 * Login channel. The exact notification subject is the ownership proof; names
 * and phone numbers supplied by the browser are never accepted here.
 * Existing owners, provider migrations and other modules retain their flows.
 */
export async function activateVerifiedNotificationMember(input: {
  storeId: string; lineUserId: string;
}): Promise<"activated" | "not_applicable" | "review" | "unavailable"> {
  try {
    return await prisma.$transaction(async tx => {
      const store = await tx.store.findUnique({
        where: { id: input.storeId }, select: { industryModule: true },
      });
      if (store?.industryModule !== "STEAMFOOT") return "not_applicable";
      const rows = await tx.customer.findMany({
        where: { storeId: input.storeId, lineUserId: input.lineUserId,
          lineLinkStatus: "LINKED", mergedIntoCustomerId: null },
        select: { id: true, name: true, phone: true, userId: true,
          identityLinks: { select: { id: true } } }, take: 2,
      });
      if (!rows.length) return "not_applicable";
      if (rows.length !== 1) return "review";
      const customer = rows[0];
      // Keep the original phone, recipient, bookings and wallets. A malformed
      // or already-owned record requires reconciliation, never a new customer.
      if (customer.userId || customer.identityLinks.length ||
          !/^09\d{8}$/.test(customer.phone) || normalizePhone(customer.phone) !== customer.phone) return "review";
      const [phoneOwner, account, link, unlink, grant] = await Promise.all([
        tx.user.findUnique({ where: { phone_role: { phone: customer.phone, role: "CUSTOMER" } }, select: { id: true } }),
        tx.account.findUnique({ where: { provider_providerAccountId: { provider: "line", providerAccountId: input.lineUserId } }, select: { id: true } }),
        tx.customerIdentityLink.findFirst({ where: { provider: "line", providerAccountId: input.lineUserId }, select: { id: true } }),
        tx.centralMemberLinkReviewRequest.findFirst({ where: { storeId: input.storeId, customerId: customer.id,
          type: "UNLINK_REQUEST", status: "APPROVED" }, select: { id: true } }),
        tx.lineRebindRequest.findFirst({ where: { storeId: input.storeId, customerId: customer.id,
          status: { in: ["PENDING_CAPTURE", "CANDIDATE_CAPTURED"] },
          OR: [{ untilUsed: true }, { expiresAt: { gt: new Date() } }] }, select: { id: true } }),
      ]);
      if (phoneOwner || account || link || unlink || grant) return "review";
      const user = await tx.user.create({
        data: { name: customer.name, phone: customer.phone, role: "CUSTOMER", status: "ACTIVE" }, select: { id: true },
      });
      const claimed = await tx.customer.updateMany({
        where: { id: customer.id, storeId: input.storeId, phone: customer.phone,
          userId: null, lineUserId: input.lineUserId, lineLinkStatus: "LINKED",
          mergedIntoCustomerId: null, identityLinks: { none: {} } },
        data: { userId: user.id, authSource: "LINE" },
      });
      if (claimed.count !== 1) throw new Error("VERIFIED_NOTIFICATION_RECORD_CHANGED");
      await tx.account.create({ data: { userId: user.id, provider: "line",
        providerAccountId: input.lineUserId, type: "oauth" } });
      await tx.customerIdentityLink.create({ data: { userId: user.id, storeId: input.storeId,
        customerId: customer.id, provider: "line", providerAccountId: input.lineUserId, lineUserId: input.lineUserId } });
      await tx.auditLog.create({ data: { actorUserId: user.id, storeId: input.storeId,
        targetType: "Customer", targetId: customer.id, action: "FIRST_LOGIN_VERIFIED_NOTIFICATION_IDENTITY",
        afterJson: { storeId: input.storeId, existingCustomerActivated: true, notificationIdentityPreserved: true } } });
      return "activated";
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    if (code === "P2002" || code === "P2034" ||
        (error instanceof Error && error.message === "VERIFIED_NOTIFICATION_RECORD_CHANGED")) return "review";
    return "unavailable";
  }
}
