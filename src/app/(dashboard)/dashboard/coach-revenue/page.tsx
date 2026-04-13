import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { getCurrentStorePlan } from "@/lib/store-plan";
import { hasFeature as hasPricingFeature } from "@/lib/feature-flags";
import { FEATURES as FF } from "@/lib/feature-flags";
import { UpgradeNoticePage } from "@/components/upgrade-notice";
import { isOwner } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getStoreFilter } from "@/lib/manager-visibility";
import { getActiveStoreForRead } from "@/lib/store";
import { RevenueReportClient } from "@/components/reports/RevenueReportClient";

export default async function CoachRevenuePage() {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "report.read"))) {
    redirect("/dashboard");
  }

  const pricingPlan = await getCurrentStorePlan();
  if (!hasPricingFeature(pricingPlan, FF.ADVANCED_REPORTS)) {
    return (
      <UpgradeNoticePage
        title="教練營收報表需升級方案"
        description="此功能需要 PRO 方案才能使用，升級後可查看完整教練營收數據。"
      />
    );
  }

  const admin = isOwner(user.role);
  const activeStoreId = await getActiveStoreForRead(user);
  const storeFilter = getStoreFilter(user, activeStoreId);

  const [stores, staffList] = await Promise.all([
    prisma.store.findMany({
      ...(admin ? {} : { where: { id: user.storeId! } }),
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.staff.findMany({
      where: { ...storeFilter, status: "ACTIVE" },
      select: { id: true, displayName: true, user: { select: { role: true } } },
      orderBy: { displayName: "asc" },
    }),
  ]);

  const coaches = staffList.map((s) => ({
    id: s.id,
    name: s.displayName,
    role: s.user.role,
  }));

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const defaultStart = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m + 1, 0);
  const defaultEnd = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-earth-800">教練營收報表</h1>
        <p className="text-sm text-earth-500">查看各教練歸屬營收、新舊客分析，並匯出 Excel</p>
      </div>

      <RevenueReportClient
        mode="coach"
        stores={stores}
        coaches={coaches}
        isAdmin={admin}
        defaultStartDate={defaultStart}
        defaultEndDate={defaultEnd}
      />
    </div>
  );
}
