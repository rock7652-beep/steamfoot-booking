import { MUSIC_HISTORY_INTEGRATION_ENABLED } from "@/lib/music-history-integration";
import { MusicDataScopeFilter } from "@/components/admin/music-data-scope-filter";
import { musicCustomerWhere, musicDataSeparationEnabled, musicDataScope } from "@/server/services/music-data-scope";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { requireCourseStore } from "@/lib/industry-module-server";
import { prisma } from "@/lib/db";
import { PageShell, PageHeader } from "@/components/desktop";
import { DashboardLink } from "@/components/dashboard-link";
import { getOpeningMakeupWorkspace } from "@/server/queries/music-opening-makeup";
import { OpeningMakeupList } from "./opening-makeup-list";

export default async function OpeningMakeupsPage({ searchParams }: { searchParams: Promise<{ customerId?: string;dataScope?:string }> }) {
  if (!MUSIC_HISTORY_INTEGRATION_ENABLED) notFound();
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "booking.read"))) notFound();
  const storeId = await getActiveStoreForRead(user);
  if (!storeId) notFound();
  await requireCourseStore(storeId);
  if (!await prisma.storeFeatureEntitlement.findFirst({ where: { storeId, featureKey: "business.music", status: "ENABLED" }, select: { storeId: true } })) notFound();
  const query = await searchParams;
  const classified=musicDataSeparationEnabled(storeId);
  const visible=classified ? await prisma.customer.findMany({where:{storeId,...musicCustomerWhere(storeId,query.dataScope)},select:{id:true}}) : undefined;
  const legacy=musicDataScope(storeId,query.dataScope)==="legacy";
  const data = await getOpeningMakeupWorkspace(storeId, query.customerId,visible?.map(c=>c.id),query.dataScope);
  const [canCreate, canUpdate] = await Promise.all([checkPermission(user.role, user.staffId, "booking.create"), checkPermission(user.role, user.staffId, "booking.update")]);
  return <PageShell className="w-full min-w-0"><PageHeader title={legacy ? "舊驗收期初補課" : "期初補課"} subtitle="預約只保留權益，確認實際出席才核銷" actions={<DashboardLink href={legacy ? "/dashboard/courses?dataScope=legacy" : "/dashboard/courses"}>返回課表</DashboardLink>} /><MusicDataScopeFilter enabled={classified}/><OpeningMakeupList classified={classified} legacy={legacy} data={data} canCreate={canCreate} canUpdate={canUpdate} /></PageShell>;
}
