import { Suspense } from "react";
import { cookies } from "next/headers";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { getCurrentUser } from "@/lib/session";
import { resolveActiveStoreId } from "@/lib/store";
import { formatTWTime } from "@/lib/date-utils";
import { getLatestResolvedRequest } from "@/server/queries/upgrade-request";
import { getLatestReconciliationRun } from "@/server/queries/reconciliation";
import { ReconciliationBanner } from "@/components/reconciliation-banner";
import { UpgradeResultBanner } from "@/components/upgrade-result-banner";
import { KpiRow, KpiRowSkeleton } from "./_sections/kpi-row";
import { TodoCards, TodoCardsSkeleton } from "./_sections/todo-cards";
import { QuickActions } from "./_sections/quick-actions";
import { TodaySchedule, TodayScheduleSkeleton } from "./_sections/today-schedule";
import { BottomSummary } from "./_sections/bottom-summary";

/**
 * 店家後台首頁 — 今日工作台（40+ 店長友善）
 *
 * 結構（上到下 5 區，spec 對齊）：
 *   A. 今日摘要 4 卡（第 4 卡為 insight）
 *   B. 今天先做這些事（task cards with CTA）
 *   C. 快捷操作（4 顆大按鈕）
 *   D. 今日預約列表（最多 8 筆）
 *   E. 低優先資訊入口（折疊化）
 *
 * 設計原則：
 *   - 單欄為主，桌機局部 grid
 *   - 不走「右側 panel」，資訊流一氣呵成往下看
 *   - 5 秒內讓店長回答：今天幾筆預約／有沒有待處理／下一步按哪
 */
export default async function DashboardHomePage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const cookieStore = await cookies();
  const cookieStoreId = cookieStore.get("active-store-id")?.value ?? null;
  const activeStoreId = resolveActiveStoreId(user, cookieStoreId);
  const isOwner = user.role === "ADMIN" || user.role === "OWNER";

  const todayLabel = formatTWTime(new Date(), { dateOnly: true });

  // 頂部 banner 查詢（快速完成即可）
  const [resolvedRequest, reconciliation] = await Promise.all([
    user.storeId
      ? getLatestResolvedRequest(user.storeId).catch(() => null)
      : Promise.resolve(null),
    isOwner ? getLatestReconciliationRun().catch(() => null) : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto max-w-[1280px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* 頁首 */}
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-earth-900">今日工作台</h1>
        <p className="text-base text-earth-700">
          {todayLabel}　歡迎回來，{user.name ?? "店長"}
        </p>
      </header>

      {/* Banner 區（條件顯示） */}
      {resolvedRequest && (
        <UpgradeResultBanner
          status={resolvedRequest.status}
          requestedPlan={resolvedRequest.requestedPlan}
          reviewNote={resolvedRequest.reviewNote}
        />
      )}
      {reconciliation && (
        <ReconciliationBanner
          status={reconciliation.status}
          mismatchCount={reconciliation.mismatchCount}
          errorCount={reconciliation.errorCount}
          startedAt={reconciliation.startedAt}
          failedChecks={reconciliation.checks.map((c) => ({
            checkName: c.checkName,
            status: c.status,
          }))}
        />
      )}

      {/* A. 今日摘要 4 卡 */}
      <Suspense fallback={<KpiRowSkeleton />}>
        <KpiRow activeStoreId={activeStoreId} isOwner={isOwner} />
      </Suspense>

      {/* B. 今天先做這些事 */}
      <Suspense fallback={<TodoCardsSkeleton />}>
        <TodoCards activeStoreId={activeStoreId} />
      </Suspense>

      {/* C. 快捷操作 */}
      <QuickActions />

      {/* D. 今日預約列表 */}
      <Suspense fallback={<TodayScheduleSkeleton />}>
        <TodaySchedule activeStoreId={activeStoreId} />
      </Suspense>

      {/* E. 低優先入口 */}
      <BottomSummary isOwner={isOwner} />

      {/* Footer tip */}
      <p className="pb-6 text-center text-sm text-earth-700">
        想看更深入的資料？
        <Link href="/dashboard/revenue" className="ml-1 font-semibold text-primary-700 hover:underline">
          前往完整分析
        </Link>
      </p>
    </div>
  );
}
