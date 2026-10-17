import { getCurrentUser } from "@/lib/session";
import { getStoreContext } from "@/lib/store-context";
import { prisma } from "@/lib/db";
import { getConfiguredStoreLine } from "@/lib/store-line-config";
import { workOrderLineId } from "@/lib/work-order-contact";
import { MemberConnectionEntry } from "@/components/member-connection-entry";

export default async function MemberLinkPage() {
  const [user, store] = await Promise.all([getCurrentUser(), getStoreContext()]);
  if (!user || !store) return null;
  const [setting, connection] = await Promise.all([
    prisma.shopConfig.findUnique({ where: { storeId: store.storeId }, select: { lineOfficialId: true, lineOfficialUrl: true } }),
    prisma.storeMemberConnection.findFirst({ where: { storeId: store.storeId, centralUserId: user.id, status: "APPROVED", channelKey: { not: { startsWith: "login:" } } }, select: { id: true } }),
  ]);
  const config = getConfiguredStoreLine(store.storeId);
  const basicId = config?.basicId ?? workOrderLineId(setting?.lineOfficialId, setting?.lineOfficialUrl);
  return <section className="mx-auto max-w-md space-y-4 p-4"><h1 className="text-xl font-semibold">本店會員與 LINE</h1><MemberConnectionEntry slug={store.storeSlug} basicId={basicId} linked={!!connection} /></section>;
}
