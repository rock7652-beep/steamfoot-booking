/**
 * /dashboard/cash-drawer — 現金抽屜獨立頁
 *
 * PR-8：主入口已改為 /dashboard/cashbook（現金管理一頁式工作台）。
 * 本頁保留供既有 bookmark / 連結使用，UI 與主入口共用 CashDrawerWorkspace
 * 元件，避免兩份 JSX 各自維護。
 *
 * 業務邏輯 / 計算規則 / 權限檢查全部沿用既有 server actions 與 queries，
 * 本頁只負責 fetch + 權限 + render workspace。
 */

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import {
  resolveStoreViewContextFromCookie,
  storeIdForViewContext,
} from "@/lib/store-view-context-server";
import { toLocalDateStr } from "@/lib/date-utils";
import { FEATURES } from "@/lib/feature-flags";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FormErrorToast } from "@/components/form-error-toast";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell, PageHeader } from "@/components/desktop";

import { getCashDrawerView, listClosedBusinessDates } from "@/server/queries/cash-drawer";
import { listStaffSelectOptions } from "@/server/queries/staff";
import { CashDrawerWorkspace } from "./cash-drawer-workspace";

interface PageProps {
  searchParams: Promise<{ error?: string; cashDrawerError?: string }>;
}

export default async function CashDrawerPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "cashDrawer.read"))) {
    redirect("/dashboard");
  }
  await searchParams; // 觸發 dynamic rendering，錯誤 toast 由 <FormErrorToast /> 自己讀 URL

  const activeStoreId = await getActiveStoreForRead(user);
  const storeViewContext = await resolveStoreViewContextFromCookie(user);
  const isViewMode = storeViewContext?.isViewMode ?? false;
  const storeId = storeIdForViewContext(activeStoreId, storeViewContext);
  if (!storeId) {
    // ADMIN 未選店時 storeId 可能為 null
    redirect("/dashboard");
  }

  if (!(await hasStoreFeature(storeId, FEATURES.CASH_DRAWER))) {
    return <CashDrawerLockedState />;
  }

  const todayStr = toLocalDateStr();
  const [y, m, d] = todayStr.split("-").map(Number);
  const todayBusinessDate = new Date(Date.UTC(y, m - 1, d));
  // 「記一筆收支」inline form 防呆提示用：近 ~180 天的已閉店營業日。
  const fromDate = new Date(Date.UTC(y, m - 1, d));
  fromDate.setUTCDate(fromDate.getUTCDate() - 180);

  const [
    view,
    canOpen,
    canClose,
    canAddEntry,
    canCreateCashbook,
    closedDates,
    staffOptions,
  ] = await Promise.all([
    getCashDrawerView(storeId, todayBusinessDate),
    isViewMode
      ? Promise.resolve(false)
      : checkPermission(user.role, user.staffId, "cashDrawer.open"),
    isViewMode
      ? Promise.resolve(false)
      : checkPermission(user.role, user.staffId, "cashDrawer.close"),
    isViewMode
      ? Promise.resolve(false)
      : checkPermission(user.role, user.staffId, "cashDrawer.entry"),
    isViewMode
      ? Promise.resolve(false)
      : checkPermission(user.role, user.staffId, "cashbook.create"),
    listClosedBusinessDates(storeId, fromDate.toISOString().slice(0, 10), todayStr),
    listStaffSelectOptions(),
  ]);
  const canInit = !isViewMode && (user.role === "ADMIN" || user.role === "OWNER");
  const canAssignStaff = !isViewMode && user.role === "ADMIN";

  return (
    <PageShell>
      <FormErrorToast />

      <PageHeader
        title="現金抽屜"
        subtitle="每日開店點錢 / 閉店點錢 / 滾動結餘核對"
        actions={
          <Link
            href="/dashboard/cashbook#cash-drawer-workspace"
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
          >
            ↑ 回現金管理
          </Link>
        }
      />

      <CashDrawerWorkspace
        view={view}
        todayStr={todayStr}
        canInit={canInit}
        canOpen={canOpen}
        canClose={canClose}
        canAddEntry={canAddEntry}
        canCreateCashbook={canCreateCashbook}
        closedDates={closedDates}
        canAssignStaff={canAssignStaff}
        staffOptions={staffOptions}
        returnPath="/dashboard/cash-drawer"
      />
    </PageShell>
  );
}

function CashDrawerLockedState() {
  return (
    <PageShell>
      <PageHeader
        title="現金抽屜"
        subtitle="每日開店點錢 / 閉店點錢 / 滾動結餘核對"
        actions={
          <Link
            href="/dashboard"
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
          >
            返回儀表板
          </Link>
        }
      />
      <EmptyState
        icon="lock"
        title="現金抽屜尚未開通"
        description="請聯絡總部加購或升級方案後，再使用每日開店點錢、閉店點錢與抽屜異動。"
        action={{ label: "返回儀表板", href: "/dashboard" }}
      />
    </PageShell>
  );
}
