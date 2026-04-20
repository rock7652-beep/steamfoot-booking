import {
  monthlyStoreSummary,
  monthlyRevenueByCategory,
} from "@/server/queries/report";
import {
  getReportSnapshotWithMeta,
  upsertReportSnapshot,
} from "@/server/queries/report-snapshot";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getCurrentStorePlan } from "@/lib/store-plan";
import { hasFeature, FEATURES } from "@/lib/feature-flags";
import { ServerTiming, withTiming } from "@/lib/perf";
import { FeatureGate } from "@/components/feature-gate";
import { UpgradeNoticePage } from "@/components/upgrade-notice";
import { getActiveStoreForRead } from "@/lib/store";
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
 *   PageHeader → 日期篩選 → KpiStrip → 店長明細 DataTable → 收入類型 DataTable → 匯出
 *
 * 沿用：
 *   - monthlyStoreSummary / monthlyRevenueByCategory（不改計算邏輯）
 *   - snapshot 快取策略（過去月份永不過期 / 當月 1h TTL）
 *   - FeatureGate + ADVANCED_REPORTS pricing plan 判斷
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

  const pricingPlan = await getCurrentStorePlan();
  if (!hasFeature(pricingPlan, FEATURES.ADVANCED_REPORTS)) {
    return (
      <UpgradeNoticePage
        title="進階報表需升級方案"
        description="此功能需升級至「成長版」方案才能使用。升級後可享有完整報表、AI 健康分析等進階功能。"
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
  const activeStoreId = await getActiveStoreForRead(user);

  const timer = new ServerTiming("/dashboard/reports");

  type StoreSummary = Awaited<ReturnType<typeof monthlyStoreSummary>>;
  type RevenueByCategory = Awaited<ReturnType<typeof monthlyRevenueByCategory>>;

  const snapshotStoreId = activeStoreId || user.storeId!;
  const isMonthPreset = activePreset === "month";
  const isPastMonth = month < currentMonth;
  const isCurrentMonth = month === currentMonth;
  const CURRENT_MONTH_TTL_MS = 60 * 60 * 1000;

  const dateRangeOpts = { startDate, endDate, activeStoreId };

  let storeSummary: StoreSummary;
  let revenueByCategory: RevenueByCategory;
  let plan: Awaited<ReturnType<typeof getCurrentStorePlan>>;
  let snapshotHit = false;

  if (isMonthPreset && (isPastMonth || isCurrentMonth)) {
    const [ssSnap, rcSnap, sp] = await Promise.all([
      withTiming("snapshotStoreSummary", timer, () =>
        getReportSnapshotWithMeta(snapshotStoreId, month, "STORE_SUMMARY"),
      ),
      withTiming("snapshotRevenueByCategory", timer, () =>
        getReportSnapshotWithMeta(snapshotStoreId, month, "REVENUE_BY_CATEGORY"),
      ),
      withTiming("getCurrentStorePlan", timer, () => getCurrentStorePlan()),
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
      withTiming("getCurrentStorePlan", timer, () => getCurrentStorePlan()),
    ]);
  }

  timer.cacheStatus("reports-snapshot", snapshotHit ? "hit" : "miss");
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
          title="報表"
          subtitle={`${displayLabel} 營收摘要`}
          actions={
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
          }
        />

        <ReportDateRange
          activePreset={activePreset}
          startDate={startDate}
          endDate={endDate}
        />

        <KpiStrip
          items={[
            {
              label: "本月營收",
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
              value: `NT$ ${Math.abs(storeSummary.totalRefund).toLocaleString()}`,
              tone: storeSummary.totalRefund < 0 ? "amber" : "earth",
            },
          ]}
        />

        {/* 店長明細 — 主表 */}
        <section className="rounded-xl border border-earth-200 bg-white">
          <div className="flex items-center justify-between px-3 py-2">
            <div>
              <h2 className="text-sm font-semibold text-earth-800">店長明細</h2>
              <p className="text-[11px] text-earth-400">
                顧客數（總 / 有效）· 完成服務 · 總收入 · 淨收
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

        {/* 收入類型 — 次表 */}
        <section className="rounded-xl border border-earth-200 bg-white">
          <div className="flex items-center justify-between px-3 py-2">
            <div>
              <h2 className="text-sm font-semibold text-earth-800">收入類型</h2>
              <p className="text-[11px] text-earth-400">體驗 / 單次 / 課程 拆分 · 依店長彙總</p>
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
      </PageShell>
    </FeatureGate>
  );
}
