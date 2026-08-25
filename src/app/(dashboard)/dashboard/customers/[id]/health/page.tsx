import { notFound, redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageHeader, PageShell } from "@/components/desktop";
import { HealthAssessmentCard } from "@/components/health-assessment-card";
import { prisma } from "@/lib/db";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { checkPermission } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { getActiveStoreForRead } from "@/lib/store";
import {
  resolveStoreViewContextFromCookie,
  storeIdForViewContext,
} from "@/lib/store-view-context-server";
import { getStaffVisibleHealthSummary } from "@/server/services/customer-health-history-visibility";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomerHealthPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "customer.read"))) {
    redirect("/dashboard");
  }

  const [activeStoreId, storeViewContext] = await Promise.all([
    getActiveStoreForRead(user),
    resolveStoreViewContextFromCookie(user),
  ]);
  const storeId = storeIdForViewContext(activeStoreId, storeViewContext);
  if (!storeId) notFound();

  const [featureEnabled, customer] = await Promise.all([
    hasStoreFeature(storeId, FEATURES.AI_HEALTH_SUMMARY),
    prisma.customer.findFirst({
      where: { id, storeId, mergedIntoCustomerId: null },
      select: { id: true, name: true, phone: true },
    }),
  ]);
  if (!featureEnabled || !customer) notFound();

  const visible = await getStaffVisibleHealthSummary({
    staffRole: user.role,
    targetCustomerId: customer.id,
    targetStoreId: storeId,
  });

  return (
    <PageShell>
      <PageHeader
        title={`${customer.name}的健康紀錄`}
        subtitle={customer.phone ?? "查看最近量測、完整數據與歷史曲線"}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/dashboard/customers/${customer.id}`}
              className="rounded-md border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50"
            >
              返回顧客資料
            </Link>
            <Link
              href="/dashboard/health"
              className="rounded-md border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50"
            >
              本店健康總覽
            </Link>
          </div>
        }
      />

      {visible.hasCrossStoreAccess && (
        <div className="mb-5 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-800">
          此顧客已在 {visible.storeCount} 家門市完成會員驗證；店長可唯讀查看完整健康歷史，每筆仍保留原始量測門市。
        </div>
      )}

      {visible.summary.latest ? (
        <HealthAssessmentCard summary={visible.summary} />
      ) : (
        <div className="rounded-xl border border-earth-200 bg-white px-4 py-12 text-center text-sm text-earth-500">
          這位顧客目前沒有健康量測紀錄
        </div>
      )}
    </PageShell>
  );
}
