import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getConfiguredStoreLine } from "@/lib/store-line-config";
import { workOrderLineId } from "@/lib/work-order-contact";
import { MemberConnectionEntry } from "@/components/member-connection-entry";
import { getCurrentUser } from "@/lib/session";

/** Public, store-explicit entrance. It reveals no candidate/customer data. */
export default async function MemberConnectPage({ searchParams }: { searchParams: Promise<{ store?: string }> }) {
  const { store: slug } = await searchParams;
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) notFound();
  const store = await prisma.store.findUnique({ where: { slug }, select: { id: true, name: true, shopConfig: { select: { lineOfficialId: true, lineOfficialUrl: true } } } });
  if (!store) notFound();
  const config = getConfiguredStoreLine(store.id);
  const basicId = config?.basicId ?? workOrderLineId(store.shopConfig?.lineOfficialId, store.shopConfig?.lineOfficialUrl);
  const user = await getCurrentUser();
  const linked = user?.role === "CUSTOMER" && !!await prisma.storeMemberConnection.findFirst({ where: { storeId: store.id, centralUserId: user.id, status: "APPROVED", channelKey: { not: { startsWith: "login:" } } }, select: { id: true } });
  return <main className="mx-auto min-h-screen max-w-md space-y-5 bg-white p-5 text-base text-earth-900"><h1 className="text-xl font-semibold">{store.name}・會員連結</h1><MemberConnectionEntry slug={slug} basicId={basicId} linked={linked} /></main>;
}
