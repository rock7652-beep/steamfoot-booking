import {
  monthlyStoreSummary,
  monthlyRevenueByCategory,
} from "@/server/queries/report";
import {
  getCustomerFlowMetrics,
  type CustomerFlowComparison,
} from "@/server/queries/customer-flow-metrics";
import {
  getReportSnapshotWithMeta,
  upsertReportSnapshot,
} from "@/server/queries/report-snapshot";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getCachedStorePlan } from "@/lib/query-cache";
import { FEATURES } from "@/lib/feature-flags";
import { hasStoreFeature } from "@/lib/feature-gate";
import {
  DATA_EXPORT_LOCKED_MESSAGE,
  DATA_EXPORT_SELECT_STORE_MESSAGE,
  hasDataExportFeature,
} from "@/lib/data-export-gate";
import { ServerTiming, withTiming } from "@/lib/perf";
import { FeatureGate } from "@/components/feature-gate";
import { UpgradeNoticePage } from "@/components/upgrade-notice";
import { getActiveStoreForRead } from "@/lib/store";
import {
  resolveStoreViewContextFromCookie,
  storeIdForViewContext,
} from "@/lib/store-view-context-server";
import { redirect } from "next/navigation";
import ReportDateRange from "@/components/report-date-range";
import { toLocalDateStr, getPresetDateRange, type DateRangePreset } from "@/lib/date-utils";
import {
  PageShell,
  PageHeader,
  KpiStrip,
  DataTable,
  EmptyRow,
  type Column,
} from "@/components/desktop";

/**
 * /dashboard/reports — 報表決策頁（Phase 2 桌機版 PR3）
 *
 * 對照 design/04-phase2-plan.md §3①：Decision Page
 *   PageHeader → 日期篩選 → 營運摘要 → 營收分析 → 店長分析
 *
 * 沿用：
 *   - monthlyStoreSummary / monthlyRevenueByCategory（不改計算邏輯）
 *   - snapshot 快取策略（過去月份永不過期 / 當月 1h TTL）
 *   - Store-aware BASIC_REPORTS entitlement gate
 *   - ReportDateRange（共用日期範圍 client 元件）
 */

interface PageProps {
  searchParams: Promise<{
    preset?: string;
    startDate?: string;
    endDate?: string;
    month?: string;
  }>;
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "report.read"))) {
    redirect("/dashboard");
  }

  const activeStoreId = await getActiveStoreForRead(user);
  const storeViewContext = await resolveStoreViewContextFromCookie(user);
  const isViewMode = storeViewContext?.isViewMode ?? false;
  const reportsStoreId = storeIdForViewContext(activeStoreId, storeViewContext);
  const canExportData = !isViewMode && (await hasDataExportFeature(reportsStoreId).catch(() => false));
  const dataExportLockedLabel = reportsStoreId
    ? DATA_EXPORT_LOCKED_MESSAGE
    : DATA_EXPORT_SELECT_STORE_MESSAGE;

  const gateStoreId = reportsStoreId ?? activeStoreId;
  if (gateStoreId && !(await hasStoreFeature(gateStoreId, FEATURES.BASIC_REPORTS))) {
    return (
      <UpgradeNoticePage
        title="營運分析尚未開通"
        description="請聯絡總部開通營運分析功能。"
      />
    );
  }

  let startDate: string;
  let endDate: string;
  let activePreset = params.preset || "month";
  let displayLabel: string;

  if (params.startDate && params.endDate) {
    startDate = params.startDate;
    endDate = params.endDate;
    activePreset = "custom";
    displayLabel = `${startDate} ~ ${endDate}`;
  } else if (params.preset && ["today", "month", "quarter"].includes(params.preset)) {
    const range = getPresetDateRange(params.preset as DateRangePreset);
    startDate = range.startDate;
    endDate = range.endDate;
    displayLabel = range.label;
  } else {
    const range = getPresetDateRange("month");
    startDate = range.startDate;
    endDate = range.endDate;
    displayLabel = range.label;
  }

  const month = startDate.slice(0, 7);
  const currentMonth = toLocalDateStr().slice(0, 7);

  const timer = new ServerTiming("/dashboard/reports");

  type StoreSummary = Awaited<ReturnType<typeof monthlyStoreSummary>>;
  type RevenueByCategory = Awaited<ReturnType<typeof monthlyRevenueByCategory>>;

  const snapshotStoreId = reportsStoreId || user.storeId!;
  const isMonthPreset = activePreset === "month";
  const isPastMonth = month < currentMonth;
  const isCurrentMonth = month === currentMonth;
  const CURRENT_MONTH_TTL_MS = 60 * 60 * 1000;

  const dateRangeOpts = { startDate, endDate, activeStoreId: reportsStoreId };

  let storeSummary: StoreSummary;
  let revenueByCategory: RevenueByCategory;
  let plan: Awaited<ReturnType<typeof getCachedStorePlan>>;
  let snapshotHit = false;

  if (isMonthPreset && (isPastMonth || isCurrentMonth)) {
    const [ssSnap, rcSnap, sp] = await Promise.all([
      withTiming("snapshotStoreSummary", timer, () =>
        getReportSnapshotWithMeta(snapshotStoreId, month, "STORE_SUMMARY"),
      ),
      withTiming("snapshotRevenueByCategory", timer, () =>
        getReportSnapshotWithMeta(snapshotStoreId, month, "REVENUE_BY_CATEGORY"),
      ),
      withTiming("getCachedStorePlan", timer, () =>
        getCachedStorePlan(reportsStoreId ?? user.storeId ?? undefined),
      ),
    ]);
    plan = sp;

    // Server component render — Date.now() 在此是單次 request-time 計算，非 client render
    // eslint-disable-next-line react-hooks/purity
    const nowMs = Date.now();
    const fresh = (m: { updatedAt: Date } | null) => {
      if (!m) return false;
      if (isPastMonth) return true;
      return nowMs - m.updatedAt.getTime() < CURRENT_MONTH_TTL_MS;
    };

    if (ssSnap && rcSnap && fresh(ssSnap) && fresh(rcSnap)) {
      storeSummary = ssSnap.data as StoreSummary;
      revenueByCategory = rcSnap.data as RevenueByCategory;
      snapshotHit = true;
    } else {
      [storeSummary, revenueByCategory] = await Promise.all([
        withTiming("monthlyStoreSummary", timer, () => monthlyStoreSummary(month, dateRangeOpts)),
        withTiming("monthlyRevenueByCategory", timer, () =>
          monthlyRevenueByCategory(month, dateRangeOpts),
        ),
      ]);
      void upsertReportSnapshot(snapshotStoreId, month, "STORE_SUMMARY", storeSummary).catch((e) =>
        console.error("[reports] snapshot store summary upsert failed", e),
      );
      void upsertReportSnapshot(
        snapshotStoreId,
        month,
        "REVENUE_BY_CATEGORY",
        revenueByCategory,
      ).catch((e) =>
        console.error("[reports] snapshot revenue by category upsert failed", e),
      );
    }
  } else {
    [storeSummary, revenueByCategory, plan] = await Promise.all([
      withTiming("monthlyStoreSummary", timer, () => monthlyStoreSummary(month, dateRangeOpts)),
      withTiming("monthlyRevenueByCategory", timer, () =>
        monthlyRevenueByCategory(month, dateRangeOpts),
      ),
      withTiming("getCachedStorePlan", timer, () =>
        getCachedStorePlan(reportsStoreId ?? user.storeId ?? undefined),
      ),
    ]);
  }

  timer.cacheStatus("reports-snapshot", snapshotHit ? "hit" : "miss");
  const customerFlowMetrics = reportsStoreId
    ? await withTiming("customerFlowMetrics", timer, () =>
        getCustomerFlowMetrics(reportsStoreId, month),
      )
    : null;
  timer.finish();

  const totalOrders = storeSummary.staffBreakdown.reduce(
    (s, r) => s + r.transactionCount,
    0,
  );

  type StaffRow = StoreSummary["staffBreakdown"][number];
  const staffColumns: Column<StaffRow>[] = [
    {
      key: "name",
      header: "店長",
      accessor: (r) => <span className="text-sm font-medium text-earth-900">{r.staffName}</span>,
    },
    {
      key: "customers",
      header: "顧客",
      align: "right",
      priority: "secondary",
      accessor: (r) => (
        <span className="tabular-nums">
          {r.customerCount}
          <span className="ml-0.5 text-[10px] text-earth-400">/{r.activeCustomerCount}</span>
        </span>
      ),
    },
    {
      key: "completed",
      header: "完成服務",
      align: "right",
      accessor: (r) => <span className="tabular-nums">{r.completedBookings} 堂</span>,
    },
    {
      key: "orders",
      header: "訂單",
      align: "right",
      priority: "secondary",
      accessor: (r) => <span className="tabular-nums">{r.transactionCount}</span>,
    },
    {
      key: "revenue",
      header: "總收入",
      align: "right",
      accessor: (r) => (
        <span className="tabular-nums text-earth-900">
          NT$ {r.totalRevenue.toLocaleString()}
        </span>
      ),
    },
    {
      key: "fee",
      header: "空間費",
      align: "right",
      priority: "secondary",
      accessor: (r) =>
        r.spaceFee > 0 ? (
          <span className="tabular-nums text-red-600">
            -NT$ {r.spaceFee.toLocaleString()}
          </span>
        ) : (
          <span className="text-earth-300">—</span>
        ),
    },
    {
      key: "net",
      header: "淨收",
      align: "right",
      accessor: (r) => (
        <span className="font-semibold tabular-nums text-primary-700">
          NT$ {r.netRevenue.toLocaleString()}
        </span>
      ),
    },
  ];

  type CategoryRow = RevenueByCategory[number];
  const categoryColumns: Column<CategoryRow>[] = [
    {
      key: "name",
      header: "店長",
      accessor: (r) => <span className="text-sm font-medium text-earth-900">{r.staffName}</span>,
    },
    {
      key: "trial",
      header: "體驗",
      align: "right",
      accessor: (r) =>
        r.trialRevenue > 0 ? (
          <span className="tabular-nums">NT$ {r.trialRevenue.toLocaleString()}</span>
        ) : (
          <span className="text-earth-300">—</span>
        ),
    },
    {
      key: "single",
      header: "單次",
      align: "right",
      accessor: (r) =>
        r.singleRevenue > 0 ? (
          <span className="tabular-nums">NT$ {r.singleRevenue.toLocaleString()}</span>
        ) : (
          <span className="text-earth-300">—</span>
        ),
    },
    {
      key: "package",
      header: "課程",
      align: "right",
      accessor: (r) =>
        r.packageRevenue > 0 ? (
          <span className="tabular-nums">NT$ {r.packageRevenue.toLocaleString()}</span>
        ) : (
          <span className="text-earth-300">—</span>
        ),
    },
    {
      key: "net",
      header: "淨收",
      align: "right",
      accessor: (r) => (
        <span className="font-semibold tabular-nums text-primary-700">
          NT$ {r.netRevenue.toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <FeatureGate plan={plan} feature={FEATURES.BASIC_REPORTS}>
      <PageShell>
        <PageHeader
          title="營運分析"
          subtitle={`${displayLabel} 營收摘要`}
          actions={
            <>
              {isViewMode ? (
                <span className="rounded-md border border-earth-200 bg-earth-50 px-3 py-1.5 text-xs font-medium text-earth-500">
                  查看模式不可匯出
                </span>
              ) : !canExportData ? (
                <span className="rounded-md border border-earth-200 bg-earth-50 px-3 py-1.5 text-xs font-medium text-earth-500">
                  {dataExportLockedLabel}
                </span>
              ) : (
                <>
                  <a
                    href={`/api/export/store-monthly?month=${month}`}
                    className="rounded-md border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50"
                    download
                  >
                    全店 CSV
                  </a>
                  <a
                    href={`/api/export/staff-monthly?month=${month}`}
                    className="rounded-md border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50"
                    download
                  >
                    店長 CSV
                  </a>
                </>
              )}
              <a
                href="/dashboard/advanced-reports"
                className="rounded-md border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50"
              >
                經營診斷 →
              </a>
              {/* 月結管理入口：服務金額是月結資料來源，最終確認與保存集中到月結管理。 */}
              <a
                href="/dashboard/service-fee-calculator"
                className="rounded-md border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100"
              >
                月結管理 →
              </a>
            </>
          }
        />

        <ReportDateRange
          activePreset={activePreset}
          startDate={startDate}
          endDate={endDate}
        />

        <section aria-labelledby="operations-summary-title">
          <div className="mb-2">
            <h2
              id="operations-summary-title"
              className="text-sm font-semibold text-earth-800"
            >
              營運摘要
            </h2>
            <p className="mt-0.5 text-[11px] text-earth-400">
              掌握本期營收、完成服務、訂單與退款概況。
            </p>
          </div>
          <KpiStrip
            items={[
              {
                label: "本期營收",
                value: `NT$ ${storeSummary.netCourseRevenue.toLocaleString()}`,
                tone: "primary",
              },
              {
                label: "完成服務",
                value: `${storeSummary.completedBookings} 堂`,
                tone: "green",
              },
              { label: "訂單數", value: `${totalOrders} 筆`, tone: "blue" },
              {
                label: "退款",
                value: `${storeSummary.totalRefund < 0 ? "-" : ""}NT$ ${Math.abs(storeSummary.totalRefund).toLocaleString()}`,
                tone: storeSummary.totalRefund < 0 ? "amber" : "earth",
              },
            ]}
          />
        </section>

        <section
          aria-labelledby="customer-flow-title"
          className="rounded-xl border border-earth-200 bg-white p-3"
        >
          <div>
            <h2 id="customer-flow-title" className="text-sm font-semibold text-earth-800">
              客流分析
            </h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-earth-400">
              依完成服務的唯一顧客計算；取消與未到不計。體驗顧客數不使用預約人數，
              多人同行者需各自建立顧客與體驗預約才會納入。
            </p>
          </div>
          {customerFlowMetrics ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["本月來客數", customerFlowMetrics.uniqueVisitors],
                ["新客數", customerFlowMetrics.newVisitors],
                ["舊客數", customerFlowMetrics.returningVisitors],
                ["體驗顧客數", customerFlowMetrics.trialCustomers],
              ].map(([label, metric]) => {
                const value = metric as (typeof customerFlowMetrics)["uniqueVisitors"];
                return (
                  <div key={label as string} className="rounded-lg bg-earth-50/70 p-3">
                    <p className="text-[11px] font-medium text-earth-500">{label as string}</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-earth-900">
                      {value.current} 位
                    </p>
                    <div className="mt-2 space-y-1 text-[11px] text-earth-500">
                      <p>較上月：{formatCustomerFlowComparison(value.mom)}</p>
                      <p>去年同月：{formatCustomerFlowComparison(value.yoy)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 rounded-lg bg-earth-50 px-3 py-2 text-xs text-earth-500">
              HQ 全店視角暫不提供客流唯一顧客數；請先選擇店舖，避免跨店重複顧客被錯誤加總。
            </p>
          )}
        </section>

        {/* 營收分析 — 依收入類型拆分 */}
        <section className="rounded-xl border border-earth-200 bg-white">
          <div className="flex items-center justify-between px-3 py-2">
            <div>
              <h2 className="text-sm font-semibold text-earth-800">營收分析</h2>
              <p className="text-[11px] text-earth-400">
                依體驗、單次與課程收入拆分，掌握本期營收組成。
              </p>
            </div>
          </div>
          {revenueByCategory.length === 0 ? (
            <EmptyRow title="本期無資料" hint="選擇的期間內沒有收入類型資料" />
          ) : (
            <DataTable
              columns={categoryColumns}
              rows={revenueByCategory}
              rowKey={(r) => r.staffId}
              className="rounded-none border-0 border-t border-earth-100"
            />
          )}
        </section>

        {/* 店長分析 — 服務量、訂單與營收表現 */}
        <section className="rounded-xl border border-earth-200 bg-white">
          <div className="flex items-center justify-between px-3 py-2">
            <div>
              <h2 className="text-sm font-semibold text-earth-800">店長分析</h2>
              <p className="text-[11px] text-earth-400">
                比較各店長的期間內有預約顧客（總／有效）、服務量、訂單與營收表現。
              </p>
            </div>
          </div>
          {storeSummary.staffBreakdown.length === 0 ? (
            <EmptyRow title="本期無資料" hint="選擇的期間內沒有店長績效資料" />
          ) : (
            <DataTable
              columns={staffColumns}
              rows={storeSummary.staffBreakdown}
              rowKey={(r) => r.staffId}
              className="rounded-none border-0 border-t border-earth-100"
            />
          )}
        </section>
      </PageShell>
    </FeatureGate>
  );
}

function formatCustomerFlowComparison(comparison: CustomerFlowComparison): string {
  const difference = `${comparison.difference > 0 ? "+" : ""}${comparison.difference}`;
  if (comparison.percentage === null) return `${difference} 位（基期為 0，無法比較）`;
  const percentage = `${comparison.percentage > 0 ? "+" : ""}${comparison.percentage.toFixed(1)}%`;
  return `${difference} 位（${percentage}）`;
}
