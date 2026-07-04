import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { prisma } from "@/lib/db";
import {
  resolveStoreViewContextFromCookie,
  storeIdForViewContext,
} from "@/lib/store-view-context-server";
import { formatDateZh, toLocalMonthStr } from "@/lib/date-utils";
import {
  getAdvancedReportsMetrics,
  type MonthlyStoreRevenuePoint,
} from "@/server/services/advanced-reports";
import {
  DataTable,
  EmptyRow,
  KpiStrip,
  PageHeader,
  PageShell,
  type Column,
} from "@/components/desktop";
import { MonthFilter } from "./month-filter";
import { FEATURES } from "@/lib/feature-flags";
import { hasStoreFeature } from "@/lib/feature-gate";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { EmptyState } from "@/components/ui/empty-state";

interface PageProps {
  searchParams: Promise<{
    month?: string;
  }>;
}

function isValidMonth(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
}

function formatPercent(value: number): string {
  return `${value.toFixed(1).replace(/\.0$/, "")}%`;
}

function formatMoney(value: number): string {
  return `NT$ ${Math.round(value).toLocaleString()}`;
}

function formatMonthLabel(month: string): string {
  const [year, mon] = month.split("-");
  return `${year} 年 ${Number(mon)} 月`;
}

function isEmptyMetrics(metrics: Awaited<ReturnType<typeof getAdvancedReportsMetrics>>): boolean {
  return (
    metrics.trialConversion.denominator === 0 &&
    metrics.renewal.denominator === 0 &&
    metrics.revisit.denominator === 0 &&
    metrics.averageOrderValue.transactionCount === 0 &&
    metrics.customerActivity.totalCustomers === 0 &&
    metrics.monthlyRevenueTrend.length === 0
  );
}

function AdvancedReportsLockedState() {
  return (
    <PageShell>
      <PageHeader
        title="進階報表"
        subtitle="體驗轉換、續購、回訪、客單價與營收趨勢"
        actions={
          <Link
            href="/dashboard"
            className="rounded-md border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50"
          >
            返回儀表板
          </Link>
        }
      />
      <EmptyState
        icon="lock"
        title="進階報表尚未開通"
        description="請聯絡總部加購或升級方案後，再查看體驗轉換、續購、回訪與月營收趨勢。"
        action={{ label: "返回儀表板", href: "/dashboard" }}
      />
    </PageShell>
  );
}

export default async function AdvancedReportsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "report.read"))) {
    redirect("/dashboard");
  }

  const activeStoreId = await getActiveStoreForRead(user);
  const storeViewContext = await resolveStoreViewContextFromCookie(user);
  const reportsStoreId = storeIdForViewContext(activeStoreId, storeViewContext);
  const gateStoreId = reportsStoreId ?? activeStoreId;
  if (gateStoreId && !(await hasStoreFeature(gateStoreId, FEATURES.ADVANCED_REPORTS))) {
    return <AdvancedReportsLockedState />;
  }

  const month = isValidMonth(params.month) ? params.month : toLocalMonthStr();

  const [metrics, store] = await Promise.all([
    getAdvancedReportsMetrics({ storeId: reportsStoreId, month }),
    reportsStoreId
      ? prisma.store.findUnique({
          where: { id: reportsStoreId },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);

  const storeName = reportsStoreId ? (store?.name ?? "目前店舖") : "全部店舖";
  const empty = isEmptyMetrics(metrics);

  const trendColumns: Column<MonthlyStoreRevenuePoint>[] = [
    {
      key: "month",
      header: "月份",
      accessor: (row) => <span className="tabular-nums">{formatMonthLabel(row.month)}</span>,
      width: "w-32",
    },
    {
      key: "store",
      header: "店舖",
      accessor: (row) => (
        <span className="font-medium text-earth-900">{row.storeName}</span>
      ),
    },
    {
      key: "transactions",
      header: "交易",
      align: "right",
      priority: "secondary",
      accessor: (row) => <span className="tabular-nums">{row.transactionCount} 筆</span>,
      width: "w-28",
    },
    {
      key: "revenue",
      header: "營收",
      align: "right",
      accessor: (row) => (
        <span className="font-semibold tabular-nums text-primary-700">
          {formatMoney(row.revenue)}
        </span>
      ),
      width: "w-36",
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="進階報表"
        subtitle={`${storeName} · ${formatMonthLabel(month)} 經營指標`}
        actions={<MonthFilter month={month} />}
      />

      <KpiStrip
        items={[
          {
            label: "體驗轉換率",
            value: formatPercent(metrics.trialConversion.rate),
            tone: "primary",
          },
          {
            label: "續購率",
            value: formatPercent(metrics.renewal.rate),
            tone: "green",
          },
          {
            label: "回訪率",
            value: formatPercent(metrics.revisit.rate),
            tone: "blue",
          },
          {
            label: "客單價",
            value: formatMoney(metrics.averageOrderValue.averageOrderValue),
            tone: "earth",
          },
          {
            label: "活躍顧客",
            value: `${metrics.customerActivity.activeCustomers} 人`,
            tone: "green",
          },
          {
            label: "沉睡顧客",
            value: `${metrics.customerActivity.dormantCustomers} 人`,
            tone: "amber",
          },
        ]}
      />

      {empty ? (
        <section className="rounded-lg border border-earth-200 bg-white">
          <EmptyRow
            title="本期尚無進階報表資料"
            hint="選擇其他月份，或等體驗、購課、交易與回訪資料累積後再查看。"
          />
        </section>
      ) : null}

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <MetricPanel
          title="體驗轉換"
          value={formatPercent(metrics.trialConversion.rate)}
          detail={`${metrics.trialConversion.numerator} / ${metrics.trialConversion.denominator} 位體驗客已轉正式`}
        />
        <MetricPanel
          title="續購"
          value={formatPercent(metrics.renewal.rate)}
          detail={`${metrics.renewal.numerator} / ${metrics.renewal.denominator} 位購課顧客有既有錢包`}
        />
        <MetricPanel
          title="回訪"
          value={formatPercent(metrics.revisit.rate)}
          detail={`${metrics.revisit.numerator} / ${metrics.revisit.denominator} 位舊客本期有完成服務`}
        />
      </section>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <section className="rounded-lg border border-earth-200 bg-white">
          <div className="border-b border-earth-100 px-3 py-2">
            <h2 className="text-sm font-semibold text-earth-800">客單價</h2>
            <p className="text-[11px] text-earth-400">
              使用已收款交易計算，退款不列入客單價分母。
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 px-3 py-3 text-sm">
            <Stat label="交易營收" value={formatMoney(metrics.averageOrderValue.revenue)} />
            <Stat label="交易數" value={`${metrics.averageOrderValue.transactionCount} 筆`} />
            <Stat
              label="平均客單"
              value={formatMoney(metrics.averageOrderValue.averageOrderValue)}
              emphasis
            />
          </div>
        </section>

        <section className="rounded-lg border border-earth-200 bg-white">
          <div className="border-b border-earth-100 px-3 py-2">
            <h2 className="text-sm font-semibold text-earth-800">顧客活躍狀態</h2>
            <p className="text-[11px] text-earth-400">
              活躍以近 30 天來店；沉睡以超過 60 天未來店估算。
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 px-3 py-3 text-sm">
            <Stat label="總顧客" value={`${metrics.customerActivity.totalCustomers} 人`} />
            <Stat
              label="活躍"
              value={`${metrics.customerActivity.activeCustomers} 人`}
              emphasis
            />
            <Stat label="沉睡" value={`${metrics.customerActivity.dormantCustomers} 人`} />
          </div>
        </section>
      </section>

      <section className="rounded-lg border border-earth-200 bg-white">
        <div className="flex items-center justify-between px-3 py-2">
          <div>
            <h2 className="text-sm font-semibold text-earth-800">月營收趨勢</h2>
            <p className="text-[11px] text-earth-400">
              最近月份已收款淨營收，依目前店舖視角彙總。
            </p>
          </div>
          <span className="text-[11px] text-earth-400">
            {formatDateZh(metrics.range.startDate)} - {formatDateZh(metrics.range.endDate)}
          </span>
        </div>
        {metrics.monthlyRevenueTrend.length === 0 ? (
          <EmptyRow title="尚無營收趨勢" hint="本視角最近月份沒有已收款交易資料。" />
        ) : (
          <DataTable
            columns={trendColumns}
            rows={metrics.monthlyRevenueTrend}
            rowKey={(row) => `${row.month}:${row.storeId}`}
            className="rounded-none border-0 border-t border-earth-100"
          />
        )}
      </section>
    </PageShell>
  );
}

function MetricPanel({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <section className="rounded-lg border border-earth-200 bg-white px-3 py-3">
      <p className="text-[11px] font-medium text-earth-500">{title}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-earth-900">{value}</p>
      <p className="mt-1 text-xs text-earth-500">{detail}</p>
    </section>
  );
}

function Stat({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] text-earth-500">{label}</p>
      <p
        className={`mt-1 font-semibold tabular-nums ${
          emphasis ? "text-primary-700" : "text-earth-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
