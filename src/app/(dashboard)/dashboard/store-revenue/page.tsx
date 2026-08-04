import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { FEATURES as FF } from "@/lib/feature-flags";
import { hasStoreFeature } from "@/lib/feature-gate";
import {
  DATA_EXPORT_LOCKED_MESSAGE,
  DATA_EXPORT_SELECT_STORE_MESSAGE,
  hasDataExportFeature,
} from "@/lib/data-export-gate";
import { UpgradeNoticePage } from "@/components/upgrade-notice";
import { isOwner } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getStoreFilter } from "@/lib/manager-visibility";
import { getActiveStoreForRead } from "@/lib/store";
import {
  resolveStoreViewContextFromCookie,
  storeIdForViewContext,
  userForViewContext,
} from "@/lib/store-view-context-server";
import { RevenueReportClient } from "@/components/reports/RevenueReportClient";

export default async function StoreRevenuePage() {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "report.read"))) {
    redirect("/dashboard");
  }

  const [activeStoreId, canCustomerExport, canReportExport] = await Promise.all([
    getActiveStoreForRead(user),
    checkPermission(user.role, user.staffId, "customer.export"),
    checkPermission(user.role, user.staffId, "report.export"),
  ]);
  const canDataExportEntry = canCustomerExport || canReportExport;
  const storeViewContext = await resolveStoreViewContextFromCookie(user);
  const isViewMode = storeViewContext?.isViewMode ?? false;
  const reportsStoreId = storeIdForViewContext(activeStoreId, storeViewContext);
  const reportsUser = userForViewContext(user, storeViewContext);
  const canExportData = !isViewMode && (await hasDataExportFeature(reportsStoreId).catch(() => false));
  const dataExportLockedMessage = reportsStoreId
    ? DATA_EXPORT_LOCKED_MESSAGE
    : DATA_EXPORT_SELECT_STORE_MESSAGE;

  const gateStoreId = reportsStoreId ?? activeStoreId;
  if (gateStoreId && !(await hasStoreFeature(gateStoreId, FF.ADVANCED_REPORTS))) {
    return (
      <UpgradeNoticePage
        title="經營診斷尚未開通"
        description="此功能需使用展店版，或由總部為店舖開通經營診斷功能。"
      />
    );
  }

  const admin = isOwner(user.role);
  const storeFilter = getStoreFilter(reportsUser, reportsStoreId);

  // Load store list + coach list for filters
  const [stores, staffList] = await Promise.all([
    prisma.store.findMany({
      ...(admin ? {} : { where: { id: reportsStoreId ?? user.storeId! } }),
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

  // Default: this month
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const defaultStart = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m + 1, 0);
  const defaultEnd = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-earth-800">店營收報表</h1>
          <p className="text-sm text-earth-500">查看各分店營收數據、交易明細，並匯出 Excel</p>
        </div>
        {canDataExportEntry ? (
          <Link
            href="/dashboard/data-export"
            className="hidden rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 md:inline-flex"
          >
            匯出資料
          </Link>
        ) : null}
      </div>

      {canDataExportEntry ? (
        <Link
          href="/dashboard/data-export"
          className="flex min-h-11 items-center justify-center rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 md:hidden"
        >
          匯出資料
        </Link>
      ) : null}

      <RevenueReportClient
        mode="store"
        stores={stores}
        coaches={coaches}
        isAdmin={admin}
        isViewMode={isViewMode}
        canExportData={canExportData}
        dataExportLockedMessage={dataExportLockedMessage}
        defaultStartDate={defaultStart}
        defaultEndDate={defaultEnd}
      />
    </div>
  );
}
