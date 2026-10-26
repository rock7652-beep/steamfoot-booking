import "server-only";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/normalize";
import { resolveCentralMemberLineLoginChannelId } from "@/lib/liff/central-member-config";
import type { TrialBookingChatLinkContext } from "./trial-booking-chat-link";

const customerSelect = { id: true, name: true, assignedStaffId: true,
  lineUserId: true, lineLinkStatus: true } as const;

/** Internal: accepts only a server-resolved, encrypted, unexpired booking entry.
 * A new record captures its verified Login identity atomically. A phone never
 * authorizes adoption of an existing record with a different notification id.
 */
export async function resolvePublicTrialLoginCustomer(input: {
  entry: TrialBookingChatLinkContext; name: string; phone: string;
}) {
  const proof = input.entry.verifiedLogin;
  const phone = normalizePhone(input.phone);
  if (!proof || input.entry.channel !== "LINE" || proof.channelId !== resolveCentralMemberLineLoginChannelId() ||
      !/^U[0-9a-f]{32}$/.test(proof.lineUserId) || !/^09\d{8}$/.test(phone) || !input.name.trim()) return { status: "conflict" as const };
  try {
    return await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${input.entry.storeId} FOR UPDATE`;
      const store = await tx.store.findUnique({ where: { id: input.entry.storeId }, select: { industryModule: true, slug: true } });
      if (store?.industryModule !== "STEAMFOOT" || !["zhubei", "hsinchu", "taichung"].includes(store.slug)) return { status: "conflict" as const };
      const entry = await tx.trialBookingLink.findFirst({ where: { id: input.entry.linkId,
        storeId: input.entry.storeId, channel: "LINE", consumedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } });
      if (!entry) return { status: "conflict" as const };
      const [account, links, phoneOwner, candidates] = await Promise.all([
        tx.account.findUnique({ where: { provider_providerAccountId: { provider: "line", providerAccountId: proof.lineUserId } },
          select: { userId: true, user: { select: { id: true, status: true, customer: { select: { id: true } } } } } }),
        tx.customerIdentityLink.findMany({ where: { provider: "line", providerAccountId: proof.lineUserId },
          select: { userId: true, storeId: true, customerId: true } }),
        tx.user.findUnique({ where: { phone_role: { phone, role: "CUSTOMER" } }, select: { id: true } }),
        tx.customer.findMany({ where: { storeId: input.entry.storeId, phone },
          select: { id: true, userId: true, lineUserId: true, mergedIntoCustomerId: true,
            identityLinks: { select: { id: true } } }, take: 2 }),
      ]);
      if (account?.user.status !== undefined && account.user.status !== "ACTIVE") return { status: "conflict" as const };
      if (links.some(link => link.userId !== account?.userId) || (phoneOwner && phoneOwner.id !== account?.userId)) return { status: "conflict" as const };
      const storeLinks = links.filter(link => link.storeId === input.entry.storeId);
      if (storeLinks.length > 1 || candidates.length > 1) return { status: "conflict" as const };
      if (storeLinks.length) {
        const linked = await tx.customer.findFirst({ where: { id: storeLinks[0].customerId,
          storeId: input.entry.storeId, mergedIntoCustomerId: null,
          OR: [{ userId: null }, { userId: account!.userId }] }, select: customerSelect });
        if (!linked || (candidates.length && candidates[0].id !== linked.id)) return { status: "conflict" as const };
        return { status: "resolved" as const, customer: linked, customerCreated: false, ownerId: account!.userId };
      }
      const candidate = candidates[0];
      // Existing records require the actual verified owner or an exact,
      // independently reachable notification subject. No name/phone shortcut.
      if (candidate && (candidate.mergedIntoCustomerId || candidate.identityLinks.length ||
          (candidate.userId ? candidate.userId !== account?.userId :
            input.entry.notificationVerified !== true || candidate.lineUserId !== proof.lineUserId))) return { status: "conflict" as const };
      if (candidate && await tx.centralMemberLinkReviewRequest.findFirst({ where: {
        storeId: input.entry.storeId, customerId: candidate.id, type: "UNLINK_REQUEST", status: "APPROVED" }, select: { id: true } })) return { status: "conflict" as const };
      let ownerId = account?.userId;
      if (!ownerId) {
        ownerId = (await tx.user.create({ data: { name: input.name.trim(), phone,
          role: "CUSTOMER", status: "ACTIVE" }, select: { id: true } })).id;
        await tx.account.create({ data: { userId: ownerId, provider: "line",
          providerAccountId: proof.lineUserId, type: "oauth" } });
      }
      const customer = candidate
        ? await tx.customer.update({ where: { id: candidate.id }, data: {
            ...(!candidate.userId && !account?.user.customer ? { userId: ownerId } : {}), authSource: "LINE",
          }, select: customerSelect })
        : await tx.customer.create({ data: { storeId: input.entry.storeId, name: input.name.trim(), phone,
            ...(!account?.user.customer ? { userId: ownerId } : {}), authSource: "LINE", customerStage: "LEAD", selfBookingEnabled: false,
            ...(input.entry.notificationVerified ? { lineUserId: proof.lineUserId, lineLinkStatus: "LINKED", lineLinkedAt: new Date() } : {}),
          }, select: customerSelect });
      await tx.customerIdentityLink.create({ data: { userId: ownerId, storeId: input.entry.storeId,
        customerId: customer.id, provider: "line", providerAccountId: proof.lineUserId, lineUserId: proof.lineUserId } });
      await tx.auditLog.create({ data: { actorUserId: ownerId, storeId: input.entry.storeId,
        targetType: "Customer", targetId: customer.id, action: "PUBLIC_TRIAL_VERIFIED_LOGIN_CAPTURE",
        afterJson: { entryId: input.entry.linkId, channelId: proof.channelId,
          customerCreated: !candidate, notificationIdentitySeparate: true } } });
      return { status: "resolved" as const, customer, customerCreated: !candidate, ownerId };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    return { status: code === "P2002" || code === "P2034" ? "conflict" as const : "unavailable" as const };
  }
}
