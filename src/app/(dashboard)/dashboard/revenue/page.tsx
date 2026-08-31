import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import {
  resolveStoreViewContextFromCookie,
  storeIdForViewContext,
} from "@/lib/store-view-context-server";
import { listTransactions } from "@/server/queries/transaction";
import { listStaffSelectOptions } from "@/server/queries/staff";
import { monthlyStoreSummary } from "@/server/queries/report";
import { toLocalDateStr, formatTWTime } from "@/lib/date-utils";
import { isVoidedTransaction, transactionStatusLabel } from "@/lib/transaction-display";
import { redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import type { TransactionType } from "@prisma/client";
import {
  PageShell,
  PageHeader,
  KpiStrip,
  SideCard,
  DataTable,
  EmptyRow,
  type Column,
} from "@/components/desktop";
import { TransactionRowActions } from "../transactions/_components/TransactionRowActions";

const TX_TYPE_LABEL: Record<string, string> = {
  TRIAL_PURCHASE: "體驗",
  SINGLE_PURCHASE: "單次",
  PACKAGE_PURCHASE: "課程",
  SUPPLEMENT: "補差額",
  REFUND: "退款",
  ADJUSTMENT: "手動調整",
  MANUAL_USED_BACKFILL: "補登已使用",
  PAPER_MIGRATION: "紙本轉入",
};

const TX_TYPE_COLOR: Record<string, string> = {
  TRIAL_PURCHASE: "bg-purple-50 text-purple-700",
  SINGLE_PURCHASE: "bg-blue-50 text-blue-700",
  PACKAGE_PURCHASE: "bg-green-50 text-green-700",
  SUPPLEMENT: "bg-yellow-50 text-yellow-700",
  REFUND: "bg-red-50 text-red-700",
  ADJUSTMENT: "bg-orange-50 text-orange-700",
  MANUAL_USED_BACKFILL: "bg-amber-50 text-amber-700",
  PAPER_MIGRATION: "bg-slate-100 text-slate-700",
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

interface PageProps {
  searchParams: Promise<{
    dateFrom?: string;
    dateTo?: string;
    transactionType?: TransactionType;
    staff?: string;
    page?: string;
  }>;
}

export default async function RevenuePage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) return null;
  const allowed = await checkPermission(user.role, user.staffId, "transaction.read");
  if (!allowed) redirect("/dashboard");

  const params = await searchParams;
  const requestedPage = Number(params.page ?? 1);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;

  const [activeStoreId, canCustomerExport, canReportExport] = await Promise.all([
    getActiveStoreForRead(user),
    checkPermission(user.role, user.staffId, "customer.export"),
    checkPermission(user.role, user.staffId, "report.export"),
  ]);
  const canDataExport = canCustomerExport || canReportExport;
  const storeViewContext = await resolveStoreViewContextFromCookie(user);
  const isViewMode = storeViewContext?.isViewMode ?? false;
  const revenueStoreId = storeIdForViewContext(activeStoreId, storeViewContext);
  const today = toLocalDateStr();
  const month = today.slice(0, 7);
  const firstDayOfMonth = `${month}-01`;
  const dateFrom = params.dateFrom ?? firstDayOfMonth;
  const dateTo = params.dateTo ?? today;

  const [
    transactionResult,
    todaySummary,
    monthSummary,
    staffOptions,
    canVoid,
    canEdit,
    canRefund,
  ] = await Promise.all([
    listTransactions({
      dateFrom,
      dateTo,
      transactionType: params.transactionType,
      revenueStaffId: params.staff,
      excludeSessionDeduction: !params.transactionType,
      page,
      pageSize: 30,
      activeStoreId: revenueStoreId,
    }),
    monthlyStoreSummary(month, {
      startDate: today,
      endDate: today,
      activeStoreId: revenueStoreId,
    }),
    monthlyStoreSummary(month, { activeStoreId: revenueStoreId }),
    revenueStoreId ? listStaffSelectOptions(revenueStoreId) : Promise.resolve([]),
    isViewMode ? Promise.resolve(false) : checkPermission(user.role, user.staffId, "transaction.void"),
    isViewMode ? Promise.resolve(false) : checkPermission(user.role, user.staffId, "transaction.create"),
    isViewMode ? Promise.resolve(false) : checkPermission(user.role, user.staffId, "transaction.refund"),
  ]);

  const { transactions, total, pageSize, periodRevenue } = transactionResult;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const monthOrderCount = monthSummary.staffBreakdown.reduce((sum, row) => sum + row.transactionCount, 0);
  const monthAvgOrder = monthOrderCount > 0 ? Math.round(monthSummary.netCourseRevenue / monthOrderCount) : 0;
  const todayNet = todaySummary.netCourseRevenue + todaySummary.cashbookIncome;
  const monthNet = monthSummary.netCourseRevenue + monthSummary.cashbookIncome;

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
      accessor: (transaction) => (
        <span className={`tabular-nums text-sm ${isVoidedTransaction(transaction) ? "text-earth-400" : "text-earth-800"}`}>
          {formatTWTime(transaction.createdAt, { dateOnly: true })}
        </span>
      ),
    },
    {
      key: "customer",
      header: "顧客",
      accessor: (transaction) => (
        <span className={`text-sm font-medium ${isVoidedTransaction(transaction) ? "text-earth-400" : "text-earth-900"}`}>
          {transaction.customer.name}
        </span>
      ),
    },
    {
      key: "type",
      header: "類型",
      accessor: (transaction) => (
        <span
          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
            TX_TYPE_COLOR[transaction.transactionType] ?? "bg-earth-100 text-earth-600"
          } ${isVoidedTransaction(transaction) ? "opacity-60" : ""}`}
        >
          {TX_TYPE_LABEL[transaction.transactionType] ?? transaction.transactionType}
        </span>
      ),
    },
    {
      key: "amount",
      header: "金額",
      align: "right",
      accessor: (transaction) => {
        const amount = Number(transaction.amount);
        const isVoided = isVoidedTransaction(transaction);
        return (
          <span
            className={`font-medium tabular-nums ${
              isVoided ? "text-earth-400 line-through" : amount < 0 ? "text-red-600" : "text-earth-900"
            }`}
          >
            {amount < 0 ? "-" : ""}NT$ {Math.abs(amount).toLocaleString()}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "狀態",
      priority: "secondary",
      accessor: (transaction) => {
        const label = transactionStatusLabel(transaction);
        return label ? (
          <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">
            {label}
          </span>
        ) : (
          <span className="text-earth-400">已完成</span>
        );
      },
    },
    {
      key: "payment",
      header: "付款",
      priority: "secondary",
      accessor: (transaction) =>
        transaction.paymentSplits.length > 0
          ? "混合付款"
          : PAY_METHOD_LABEL[transaction.paymentMethod] ?? transaction.paymentMethod,
    },
    {
      key: "staff",
      header: "歸屬",
      priority: "secondary",
      accessor: (transaction) => transaction.revenueStaff?.displayName ?? "—",
    },
    {
      key: "action",
      header: "處理",
      align: "right",
      noLink: true,
      accessor: (transaction) => (
        <TransactionRowActions
          transactionId={transaction.id}
          staffOptions={staffOptions}
          canVoid={canVoid}
          canEdit={canEdit}
          canRefund={canRefund}
        />
      ),
    },
  ];

  const quickLinks: Array<{ href: string; label: string; hint: string }> = [
    { href: "/dashboard/store-revenue", label: "收入總覽", hint: "月 / 季 / 年報表" },
    { href: "/dashboard/cashbook", label: "現金帳", hint: "零售、其他收支與現金管理" },
    ...(!isViewMode
      ? [{ href: "/dashboard/reconciliation", label: "對帳中心", hint: "系統對帳差異" }]
      : []),
  ];

  const buildPageHref = (targetPage: number) => {
    const query = new URLSearchParams({ dateFrom, dateTo });
    if (params.transactionType) query.set("transactionType", params.transactionType);
    if (params.staff) query.set("staff", params.staff);
    if (targetPage > 1) query.set("page", String(targetPage));
    return `/dashboard/revenue?${query.toString()}`;
  };

  return (
    <PageShell>
      <PageHeader
        title="營運"
        subtitle="營收指標、交易查詢與修正都在這一頁完成"
        actions={
          canDataExport ? (
            <Link
              href="/dashboard/data-export"
              className="hidden rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 md:inline-flex"
            >
              匯出資料
            </Link>
          ) : null
        }
      />

      {canDataExport ? (
        <Link
          href="/dashboard/data-export"
          className="flex min-h-11 items-center justify-center rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 md:hidden"
        >
          匯出資料
        </Link>
      ) : null}

      {isViewMode && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
          目前正在檢視分店營運資料。可以查看交易詳情，但無法修改、作廢或退款。
        </div>
      )}

      <KpiStrip items={kpis} />

      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 lg:col-span-9">
          <section className="overflow-hidden rounded-xl border border-earth-200 bg-white">
            <div className="border-b border-earth-100 px-3 py-3">
              <div>
                <h2 className="text-sm font-semibold text-earth-800">交易工作台</h2>
                <p className="mt-0.5 text-[11px] text-earth-400">
                  直接篩選完整交易；點最右側「⋯」即可在右側修改、作廢或退款，不需跳頁。
                </p>
              </div>

              <form method="GET" className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.15fr_1.15fr_auto_auto] xl:items-end">
                <label className="text-[11px] text-earth-500">
                  開始日期
                  <input
                    name="dateFrom"
                    type="date"
                    defaultValue={dateFrom}
                    className="mt-1 block min-h-10 w-full rounded-lg border border-earth-300 bg-white px-2.5 py-1.5 text-sm text-earth-800 focus:outline-none focus:ring-2 focus:ring-primary-200"
                  />
                </label>
                <label className="text-[11px] text-earth-500">
                  結束日期
                  <input
                    name="dateTo"
                    type="date"
                    defaultValue={dateTo}
                    className="mt-1 block min-h-10 w-full rounded-lg border border-earth-300 bg-white px-2.5 py-1.5 text-sm text-earth-800 focus:outline-none focus:ring-2 focus:ring-primary-200"
                  />
                </label>
                <label className="text-[11px] text-earth-500">
                  類型
                  <select
                    name="transactionType"
                    defaultValue={params.transactionType ?? ""}
                    className="mt-1 block min-h-10 w-full rounded-lg border border-earth-300 bg-white px-2.5 py-1.5 text-sm text-earth-800 focus:outline-none focus:ring-2 focus:ring-primary-200"
                  >
                    <option value="">所有類型</option>
                    {Object.entries(TX_TYPE_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <label className="text-[11px] text-earth-500">
                  店長
                  <select
                    name="staff"
                    defaultValue={params.staff ?? ""}
                    className="mt-1 block min-h-10 w-full rounded-lg border border-earth-300 bg-white px-2.5 py-1.5 text-sm text-earth-800 focus:outline-none focus:ring-2 focus:ring-primary-200"
                  >
                    <option value="">全部店長</option>
                    {staffOptions.map((staff) => (
                      <option key={staff.id} value={staff.id}>{staff.displayName}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  className="min-h-10 rounded-lg bg-earth-800 px-4 text-sm font-medium text-white hover:bg-earth-900"
                >
                  查詢
                </button>
                <Link
                  href="/dashboard/revenue"
                  className="flex min-h-10 items-center justify-center rounded-lg border border-earth-200 px-3 text-sm text-earth-500 hover:bg-earth-50"
                >
                  清除
                </Link>
              </form>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-primary-50 px-3 py-2 text-xs text-primary-800">
                <span>
                  指定期間營業額 <strong>NT$ {periodRevenue.toLocaleString()}</strong>
                </span>
                <span className="text-primary-600">共 {total} 筆交易</span>
              </div>
            </div>

            {transactions.length === 0 ? (
              <EmptyRow
                title="沒有符合條件的交易"
                hint="調整上方日期或篩選條件即可重新查詢"
                cta={isViewMode ? undefined : { label: "記一筆收支", href: "/dashboard/cashbook" }}
              />
            ) : (
              <DataTable
                columns={columns}
                rows={transactions}
                rowKey={(transaction) => transaction.id}
                rowClassName={(transaction) =>
                  isVoidedTransaction(transaction) ? "bg-earth-50/60 text-earth-400" : ""
                }
                className="rounded-none border-0"
              />
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-earth-100 px-3 py-2 text-xs text-earth-500">
                <span>第 {Math.min(page, totalPages)} / {totalPages} 頁</span>
                <div className="flex items-center gap-2">
                  {page > 1 ? (
                    <Link href={buildPageHref(page - 1)} className="rounded-md border border-earth-200 px-3 py-1.5 hover:bg-earth-50">
                      上一頁
                    </Link>
                  ) : (
                    <span className="rounded-md border border-earth-100 px-3 py-1.5 text-earth-300">上一頁</span>
                  )}
                  {page < totalPages ? (
                    <Link href={buildPageHref(page + 1)} className="rounded-md border border-earth-200 px-3 py-1.5 hover:bg-earth-50">
                      下一頁
                    </Link>
                  ) : (
                    <span className="rounded-md border border-earth-100 px-3 py-1.5 text-earth-300">下一頁</span>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="col-span-12 space-y-3 lg:col-span-3">
          <SideCard title="相關工具" subtitle={isViewMode ? "唯讀營運工具" : "需要時再進入"}>
            <div className="flex flex-col gap-1">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center justify-between rounded-md border border-earth-200 px-3 py-1.5 hover:bg-earth-50"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-earth-800">{link.label}</p>
                    <p className="truncate text-[10px] text-earth-400">{link.hint}</p>
                  </div>
                  <span className="text-[11px] text-earth-400">→</span>
                </Link>
              ))}
            </div>
          </SideCard>

          <SideCard title="本月概況" subtitle={`${month} 累積`}>
            <div className="flex flex-col gap-2 text-[12px]">
              <SummaryRow label="系統收入" value={`NT$ ${monthSummary.totalCourseRevenue.toLocaleString()}`} />
              {monthSummary.cashbookIncome > 0 && (
                <SummaryRow label="手動收入" value={`NT$ ${monthSummary.cashbookIncome.toLocaleString()}`} />
              )}
              <SummaryRow
                label="退款"
                value={`${monthSummary.totalRefund < 0 ? "-" : ""}NT$ ${Math.abs(monthSummary.totalRefund).toLocaleString()}`}
                tone="red"
              />
              <SummaryRow label="本月營收" value={`NT$ ${monthNet.toLocaleString()}`} tone="primary" />
              <SummaryRow label="完成服務" value={`${monthSummary.completedBookings} 筆`} />
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
