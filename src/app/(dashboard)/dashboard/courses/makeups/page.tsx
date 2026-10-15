import { musicCustomerWhere, musicDataSeparationEnabled, musicDataScope } from "@/server/services/music-data-scope";
import { MusicDataScopeFilter } from "@/components/admin/music-data-scope-filter";
import { studentReturnHref } from "@/lib/music-student-navigation";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { prisma } from "@/lib/db";
import { getManagerCustomerWhere } from "@/lib/manager-visibility";
import { requireCourseStore } from "@/lib/industry-module-server";
import { resolveStoreViewContextFromCookie } from "@/lib/store-view-context-server";
import { PageShell, PageHeader } from "@/components/desktop";
import { DashboardLink } from "@/components/dashboard-link";
import { getOpeningMakeupWorkspace } from "@/server/queries/music-opening-makeup";
import { getMusicLeaveWorkspace } from "@/server/queries/music-leave-workspace";
import { OpeningMakeupList } from "../opening-makeups/opening-makeup-list";
import { NativeMakeupList } from "./native-makeup-list";

export default async function MusicMakeupsPage({ searchParams }: { searchParams: Promise<{ customerId?: string; returnQuery?: string; dataScope?:string }> }) {
  const user = await getCurrentUser();
  if (!user || !await checkPermission(user.role, user.staffId, "booking.read") || !await checkPermission(user.role, user.staffId, "customer.read")) notFound();
  const storeId = await getActiveStoreForRead(user);
  if (!storeId) notFound();
  await requireCourseStore(storeId);
  if (!await prisma.storeFeatureEntitlement.findFirst({ where: { storeId, featureKey: "business.music", status: "ENABLED" }, select: { storeId: true } })) notFound();
  const query = await searchParams;
  const customers = await prisma.customer.findMany({ where: { ...getManagerCustomerWhere(user.role, user.staffId, storeId), storeId, mergedIntoCustomerId: null, AND: [musicCustomerWhere(storeId,query.dataScope),...(query.customerId ? [{ id: query.customerId }] : [])] }, select: { id: true, name: true } });
  if (query.customerId && !customers.length) notFound();
  const canReadCards = await checkPermission(user.role, user.staffId, "wallet.read");
  const readOnly = (await resolveStoreViewContextFromCookie(user))?.isViewMode ?? false;
  const [opening, native, canCreate, canUpdate] = await Promise.all([
    getOpeningMakeupWorkspace(storeId, query.customerId, customers.map(c => c.id),query.dataScope),
    canReadCards ? getMusicLeaveWorkspace(storeId, customers,query.dataScope) : null,
    checkPermission(user.role, user.staffId, "booking.create"), checkPermission(user.role, user.staffId, "booking.update"),
  ]);
  return <PageShell className="w-full min-w-0"><PageHeader title={query.customerId ? `${customers[0].name} · 請假與補課` : "請假與補課"} subtitle="從原課查看扣堂與期限，安排後直接進入補課點名" actions={<div className="flex flex-wrap gap-2">{query.customerId && <DashboardLink className="inline-flex min-h-11 items-center rounded-lg border px-3 text-sm" href={studentReturnHref(query.customerId, query.returnQuery)}>返回學員</DashboardLink>}<DashboardLink className="inline-flex min-h-11 items-center rounded-lg border px-3 text-sm" href={musicDataScope(storeId,query.dataScope)==="legacy"?"/dashboard/courses?dataScope=legacy":"/dashboard/courses"}>返回課表</DashboardLink></div>} />
    <MusicDataScopeFilter enabled={musicDataSeparationEnabled(storeId)}/>
    <section className="space-y-3"><h2 className="font-semibold">{musicDataScope(storeId,query.dataScope)==="legacy"?"舊驗收模擬的期初補課":"音教雲帶入的補課"}</h2><OpeningMakeupList legacy={musicDataScope(storeId,query.dataScope)==="legacy"} data={opening} canCreate={canCreate && !readOnly} canUpdate={canUpdate && !readOnly} compact classified={musicDataSeparationEnabled(storeId)} /></section>
    {native ? <NativeMakeupList classified={musicDataSeparationEnabled(storeId)} data={native} canCreate={canCreate && !readOnly} /> : <p className="text-sm text-earth-600">查看蒸管家補課方案需學費方案檢視權限。</p>}
  </PageShell>;
}
