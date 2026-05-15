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
import { toLocalDateStr } from "@/lib/date-utils";
import { getCurrentStorePlan } from "@/lib/store-plan";
import { FEATURES } from "@/lib/feature-flags";
import { FeatureGate } from "@/components/feature-gate";
import { FormErrorToast } from "@/components/form-error-toast";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageShell, PageHeader } from "@/components/desktop";

import { getCashDrawerView } from "@/server/queries/cash-drawer";
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

  const storeId = await getActiveStoreForRead(user);
  if (!storeId) {
    // ADMIN 未選店時 storeId 可能為 null
    redirect("/dashboard");
  }
  const todayStr = toLocalDateStr();
  const [y, m, d] = todayStr.split("-").map(Number);
  const todayBusinessDate = new Date(Date.UTC(y, m - 1, d));

  const [plan, view, canOpen, canClose, canAddEntry] = await Promise.all([
    getCurrentStorePlan(),
    getCashDrawerView(storeId, todayBusinessDate),
    checkPermission(user.role, user.staffId, "cashDrawer.open"),
    checkPermission(user.role, user.staffId, "cashDrawer.close"),
    checkPermission(user.role, user.staffId, "cashDrawer.entry"),
  ]);
  const canInit = user.role === "ADMIN" || user.role === "OWNER";

  return (
    <FeatureGate plan={plan} feature={FEATURES.CASHBOOK}>
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
          returnPath="/dashboard/cash-drawer"
        />
      </PageShell>
    </FeatureGate>
  );
}
