import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { listTransactions } from "@/server/queries/transaction";
import { monthlyStoreSummary } from "@/server/queries/report";
import { toLocalDateStr, formatTWTime } from "@/lib/date-utils";
import { redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import {
  PageShell,
  PageHeader,
  KpiStrip,
  SideCard,
  DataTable,
  EmptyRow,
  type Column,
} from "@/components/desktop";

/**
 * /dashboard/revenue — 營收決策頁（Phase 2 桌機版 PR3）
 *
 * 對照 design/04-phase2-plan.md §3①：Decision Page
 *   PageHeader → KpiStrip → 8+4 grid
 *   左側：最近交易主表（DataTable）
 *   右側：SideCard 快速導航（收入總覽 / 交易紀錄 / 現金帳 / 對帳中心）+ 本月概況
 *
 * 權限：`transaction.read`。
 * 資料：沿用 listTransactions / monthlyStoreSummary，不新增計算邏輯。
 */

const TX_TYPE_LABEL: Record<string, string> = {
  TRIAL_PURCHASE: "體驗",
  SINGLE_PURCHASE: "單次",
  PACKAGE_PURCHASE: "課程",
  SUPPLEMENT: "補差額",
  REFUND: "退款",
  ADJUSTMENT: "手動調整",
};

const TX_TYPE_COLOR: Record<string, string> = {
  TRIAL_PURCHASE: "bg-purple-50 text-purple-700",
  SINGLE_PURCHASE: "bg-blue-50 text-blue-700",
  PACKAGE_PURCHASE: "bg-green-50 text-green-700",
  SUPPLEMENT: "bg-yellow-50 text-yellow-700",
  REFUND: "bg-red-50 text-red-700",
  ADJUSTMENT: "bg-orange-50 text-orange-700",
};

const PAY_METHOD_LABEL: Record<string, string> = {
  CASH: "現金",
  TRANSFER: "匯款",
  LINE_PAY: "LINE Pay",
  CREDIT_CARD: "信用卡",
  OTHER: "其他",
  UNPAID: "未付款",
};

type TxRow = Awaited<ReturnType<typeof listTransactions>>["transactions"][number];

export default async function RevenuePage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const allowed = await checkPermission(user.role, user.staffId, "transaction.read");
  if (!allowed) redirect("/dashboard");

  const activeStoreId = await getActiveStoreForRead(user);
  const today = toLocalDateStr();
  const month = today.slice(0, 7);

  const [{ transactions }, todaySummary, monthSummary] = await Promise.all([
    listTransactions({
      excludeSessionDeduction: true,
      pageSize: 15,
      activeStoreId,
    }),
    monthlyStoreSummary(month, { startDate: today, endDate: today, activeStoreId }),
    monthlyStoreSummary(month, { activeStoreId }),
  ]);

  const monthOrderCount = monthSummary.staffBreakdown.reduce(
    (s, r) => s + r.transactionCount,
    0,
  );
  const monthAvgOrder =
    monthOrderCount > 0 ? Math.round(monthSummary.netCourseRevenue / monthOrderCount) : 0;

  const todayNet = todaySummary.netCourseRevenue;
  const monthNet = monthSummary.netCourseRevenue;

  const kpis = [
    { label: "今日營收", value: `NT$ ${todayNet.toLocaleString()}`, tone: "primary" as const },
    { label: "本月營收", value: `NT$ ${monthNet.toLocaleString()}`, tone: "green" as const },
    { label: "本月訂單", value: `${monthOrderCount} 筆`, tone: "blue" as const },
    { label: "平均客單價", value: `NT$ ${monthAvgOrder.toLocaleString()}`, tone: "earth" as const },
  ];

  const columns: Column<TxRow>[] = [
    {
      key: "date",
      header: "日期",
      accessor: (t) => (
        <span className="tabular-nums text-sm text-earth-800">
          {formatTWTime(t.createdAt, { dateOnly: true })}
        </span>
      ),
    },
    {
      key: "customer",
      header: "顧客",
      accessor: (t) => (
        <span className="text-sm font-medium text-earth-900">{t.customer.name}</span>
      ),
    },
    {
      key: "type",
      header: "類型",
      accessor: (t) => (
        <span
          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
            TX_TYPE_COLOR[t.transactionType] ?? "bg-earth-100 text-earth-600"
          }`}
        >
          {TX_TYPE_LABEL[t.transactionType] ?? t.transactionType}
        </span>
      ),
    },
    {
      key: "amount",
      header: "金額",
      align: "right",
      accessor: (t) => {
        const amt = Number(t.amount);
        return (
          <span className={`font-medium tabular-nums ${amt < 0 ? "text-red-600" : "text-earth-900"}`}>
            {amt < 0 ? "-" : ""}NT$ {Math.abs(amt).toLocaleString()}
          </span>
        );
      },
    },
    {
      key: "payment",
      header: "付款",
      priority: "secondary",
      accessor: (t) => PAY_METHOD_LABEL[t.paymentMethod] ?? t.paymentMethod,
    },
    {
      key: "staff",
      header: "歸屬",
      priority: "secondary",
      accessor: (t) => t.revenueStaff?.displayName ?? "—",
    },
  ];

  const quickLinks: Array<{ href: string; label: string; hint: string }> = [
    { href: "/dashboard/store-revenue", label: "收入總覽", hint: "月 / 季 / 年報表" },
    { href: "/dashboard/transactions", label: "交易紀錄", hint: "所有收退款明細" },
    { href: "/dashboard/cashbook", label: "現金帳", hint: "手工收支記帳" },
    { href: "/dashboard/reconciliation", label: "對帳中心", hint: "系統對帳差異" },
  ];

  return (
    <PageShell>
      <PageHeader
        title="營收"
        subtitle="今日 / 本月 核心指標，再快速進入對應明細"
        actions={
          <Link
            href="/dashboard/transactions"
            className="rounded-md border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50"
          >
            所有交易 →
          </Link>
        }
      />

      <KpiStrip items={kpis} />

      <div className="grid grid-cols-12 gap-3">
        {/* 左側：最近交易主表 */}
        <div className="col-span-12 lg:col-span-8">
          <section className="rounded-xl border border-earth-200 bg-white">
            <div className="flex items-center justify-between px-3 py-2">
              <div>
                <h2 className="text-sm font-semibold text-earth-800">最近交易</h2>
                <p className="text-[11px] text-earth-400">最新 {transactions.length} 筆（已排除 0 元堂數扣抵）</p>
              </div>
              <Link
                href="/dashboard/transactions"
                className="text-[11px] text-primary-600 hover:text-primary-700"
              >
                完整列表 →
              </Link>
            </div>
            {transactions.length === 0 ? (
              <EmptyRow
                title="近期尚無交易"
                hint="本月開始累積後會出現在這裡"
                cta={{ label: "手動記帳", href: "/dashboard/cashbook" }}
              />
            ) : (
              <DataTable
                columns={columns}
                rows={transactions}
                rowKey={(t) => t.id}
                rowHref={(t) => `/dashboard/customers/${t.customer.id}`}
                className="rounded-none border-0 border-t border-earth-100"
              />
            )}
          </section>
        </div>

        {/* 右側：快速導航 + 本月概況 */}
        <aside className="col-span-12 space-y-3 lg:col-span-4">
          <SideCard title="快速導航" subtitle="四個子系統入口">
            <div className="flex flex-col gap-1">
              {quickLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="flex items-center justify-between rounded-md border border-earth-200 px-3 py-1.5 hover:bg-earth-50"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-earth-800">{l.label}</p>
                    <p className="truncate text-[10px] text-earth-400">{l.hint}</p>
                  </div>
                  <span className="text-[11px] text-earth-400">→</span>
                </Link>
              ))}
            </div>
          </SideCard>

          <SideCard title="本月概況" subtitle={`${month} 累積`}>
            <div className="flex flex-col gap-2 text-[12px]">
              <SummaryRow label="課程總收入" value={`NT$ ${monthSummary.totalCourseRevenue.toLocaleString()}`} />
              <SummaryRow
                label="退款"
                value={`${monthSummary.totalRefund < 0 ? "-" : ""}NT$ ${Math.abs(monthSummary.totalRefund).toLocaleString()}`}
                tone="red"
              />
              <SummaryRow label="淨收入" value={`NT$ ${monthNet.toLocaleString()}`} tone="primary" />
              <SummaryRow label="完成服務" value={`${monthSummary.completedBookings} 堂`} />
            </div>
          </SideCard>
        </aside>
      </div>
    </PageShell>
  );
}

function SummaryRow({
  label,
  value,
  tone = "earth",
}: {
  label: string;
  value: string;
  tone?: "earth" | "red" | "primary";
}) {
  const toneClass =
    tone === "red"
      ? "text-red-600"
      : tone === "primary"
        ? "text-primary-700 font-semibold"
        : "text-earth-800";
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-earth-500">{label}</span>
      <span className={`tabular-nums ${toneClass}`}>{value}</span>
    </div>
  );
}
