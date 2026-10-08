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

export default async function OpeningMakeupsPage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "booking.read"))) notFound();
  const storeId = await getActiveStoreForRead(user);
  if (!storeId) notFound();
  await requireCourseStore(storeId);
  if (!await prisma.storeFeatureEntitlement.findFirst({ where: { storeId, featureKey: "business.music", status: "ENABLED" }, select: { storeId: true } })) notFound();
  const query = await searchParams;
  const data = await getOpeningMakeupWorkspace(storeId, query.customerId);
  const [canCreate, canUpdate] = await Promise.all([checkPermission(user.role, user.staffId, "booking.create"), checkPermission(user.role, user.staffId, "booking.update")]);
  return <PageShell className="w-full min-w-0"><PageHeader title="期初補課" subtitle="預約只保留權益，確認實際出席才核銷" actions={<DashboardLink href="/dashboard/courses">返回課表</DashboardLink>} /><OpeningMakeupList data={data} canCreate={canCreate} canUpdate={canUpdate} /></PageShell>;
}
