import { redirect } from "next/navigation";
import { EmptyRow, KpiStrip, PageHeader, PageShell } from "@/components/desktop";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateZh, toLocalMonthStr } from "@/lib/date-utils";
import { FEATURES } from "@/lib/feature-flags";
import { hasStoreFeature } from "@/lib/feature-gate";
import { checkPermission } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { getActiveStoreForRead } from "@/lib/store";
import {
  resolveStoreViewContextFromCookie,
  storeIdForViewContext,
} from "@/lib/store-view-context-server";
import { getServiceFeeCalculatorSummary } from "@/server/services/service-fee-calculator";
import {
  getStoreSettlementForStoreByMonth,
  getStoreSettlementsForStore,
} from "@/server/services/store-settlements";
import { MonthFilter } from "../advanced-reports/month-filter";
import { ServiceFeeCalculatorForm } from "./calculator-form";

interface PageProps {
  searchParams: Promise<{
    month?: string;
  }>;
}

function isValidMonth(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
}

function formatMoney(value: number): string {
  return `NT$ ${Math.round(value).toLocaleString()}`;
}

function formatMonthLabel(month: string): string {
  const [year, mon] = month.split("-");
  return `${year} 年 ${Number(mon)} 月`;
}

export default async function ServiceFeeCalculatorPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "report.read"))) {
    redirect("/dashboard");
  }

  const activeStoreId = await getActiveStoreForRead(user);
  const storeViewContext = await resolveStoreViewContextFromCookie(user);
  const calculatorStoreId = storeIdForViewContext(activeStoreId, storeViewContext);
  const month = isValidMonth(params.month) ? params.month : toLocalMonthStr();
  const gateStoreId = calculatorStoreId ?? activeStoreId;
  if (gateStoreId && !(await hasStoreFeature(gateStoreId, FEATURES.SERVICE_FEE_CALCULATOR))) {
    return <ServiceFeeCalculatorLockedState />;
  }

  const [summary, currentSettlement, settlements] = await Promise.all([
    getServiceFeeCalculatorSummary({ storeId: calculatorStoreId, month }),
    calculatorStoreId
      ? getStoreSettlementForStoreByMonth(calculatorStoreId, month)
      : Promise.resolve(null),
    calculatorStoreId
      ? getStoreSettlementsForStore(calculatorStoreId)
      : Promise.resolve([]),
  ]);
  const storeName = summary.storeName;
  const empty = summary.grossRevenue === 0 && summary.refundAmount === 0;

  return (
    <PageShell>
      <PageHeader
        title="營運結算工具"
        subtitle={`${storeName} · ${formatMonthLabel(month)} 月結試算`}
        actions={<MonthFilter month={month} />}
      />

      <section className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        此為試算工具，尚未建立正式月結單。
      </section>

      <KpiStrip
        items={[
          {
            label: "當月總收款",
            value: formatMoney(summary.grossRevenue),
            tone: "primary",
          },
          {
            label: "退款",
            value: formatMoney(summary.refundAmount),
            tone: "amber",
          },
          {
            label: "有效營收",
            value: formatMoney(summary.netRevenue),
            tone: "green",
          },
          {
            label: "收款交易",
            value: `${summary.revenueTransactionCount} 筆`,
            tone: "earth",
          },
          {
            label: "退款交易",
            value: `${summary.refundTransactionCount} 筆`,
            tone: "earth",
          },
        ]}
      />

      {empty ? (
        <section className="rounded-lg border border-earth-200 bg-white">
          <EmptyRow
            title="本月份尚無結算資料"
            hint="目前店舖視角在此月份沒有已收款交易或退款；可切換月份後再試算。"
          />
        </section>
      ) : null}

      <section className="rounded-lg border border-earth-200 bg-white">
        <div className="border-b border-earth-100 px-3 py-2">
          <h2 className="text-sm font-semibold text-earth-800">營收摘要</h2>
          <p className="text-[11px] text-earth-400">
            {formatDateZh(summary.range.startDate)} - {formatDateZh(summary.range.endDate)}
            ，只納入已收款 / 已確認交易，退款會自有效營收扣回。
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 px-3 py-3 text-sm lg:grid-cols-4">
          <Stat label="當月總收款" value={formatMoney(summary.grossRevenue)} />
          <Stat label="退款" value={formatMoney(summary.refundAmount)} />
          <Stat label="有效營收" value={formatMoney(summary.netRevenue)} emphasis />
          <Stat
            label="交易數"
            value={`${summary.revenueTransactionCount + summary.refundTransactionCount} 筆`}
          />
        </div>
      </section>

      <ServiceFeeCalculatorForm
        key={`${month}:${currentSettlement?.updatedAt.toISOString() ?? "new"}`}
        summary={summary}
        currentSettlement={currentSettlement}
        settlements={settlements}
        canSave={Boolean(calculatorStoreId)}
      />
    </PageShell>
  );
}

function ServiceFeeCalculatorLockedState() {
  return (
    <PageShell>
      <PageHeader
        title="營運結算工具"
        subtitle="依月份試算店舖營收、分潤與應收金額"
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
        title="營運結算工具尚未開通"
        description="請聯絡總部加購或升級方案後，再使用月結試算、儲存、確認與匯出功能。"
        action={{ label: "返回儀表板", href: "/dashboard" }}
      />
    </PageShell>
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
