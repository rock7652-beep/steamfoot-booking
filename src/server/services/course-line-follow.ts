import { prisma } from "@/lib/db";
import { storeLineIdentityProvider, type StoreLineConfig } from "@/lib/store-line-config";

/** Called only after own-channel webhook HMAC verification. Never creates or binds a member. */
export async function handleConfiguredCourseLineFollow(config: StoreLineConfig, event: {
  type: string; source?: { userId?: string }; timestamp?: number;
}) {
  if (!["follow", "unfollow"].includes(event.type) || !event.source?.userId ||
      !Number.isFinite(event.timestamp)) return;
  const at = new Date(event.timestamp!);
  if (!Number.isFinite(at.getTime()) || at.getTime() > Date.now() + 60_000) return;
  const links = await prisma.customerIdentityLink.findMany({
    where: { storeId: config.storeId, provider: storeLineIdentityProvider(config), providerAccountId: event.source.userId,
      customer: { storeId: config.storeId, mergedIntoCustomerId: null } },
    select: { customerId: true }, take: 2,
  });
  if (links.length !== 1) return;
  // Preserve ordering on webhook redelivery, without populating legacy raw LINE ids.
  await prisma.customer.updateMany({
    where: { id: links[0].customerId, storeId: config.storeId,
      OR: [{ lineLinkedAt: null }, { lineLinkedAt: { lt: at } }] },
    data: { lineLinkStatus: event.type === "unfollow" ? "BLOCKED" : "LINKED", lineLinkedAt: at },
  });
}
