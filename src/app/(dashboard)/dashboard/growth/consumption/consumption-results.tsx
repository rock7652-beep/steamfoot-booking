import { DataTable, type Column } from "@/components/desktop";
import { DashboardLink } from "@/components/dashboard-link";
import { CustomerPageLink } from "@/components/customer-page-link";
import { CONSUMPTION_METRICS, CONSUMPTION_PAGE_SIZE, CONSUMPTION_PATH, consumptionSearchParams, type ConsumptionFilters, type ConsumptionMetric, type ConsumptionRow } from "@/lib/customer-consumption";

export function ConsumptionResults({ rows, total, matched, page, filters, metrics, canExport, courseMode = false }: {
  rows: ConsumptionRow[]; total: number; matched: number; page: number;
  filters: ConsumptionFilters; metrics: ConsumptionMetric[]; canExport: boolean; courseMode?: boolean;
}) {
  const query = consumptionSearchParams(filters);
  const pages = Math.max(1, Math.ceil(total / CONSUMPTION_PAGE_SIZE));
  const pageHref = (next: number) => {
    const params = new URLSearchParams(query); params.set("page", String(next));
    return `${CONSUMPTION_PATH}?${params}`;
  };
  const columns: Column<ConsumptionRow>[] = [
    { key: "name", header: "顧客", width: "min-w-40", accessor: row => <div className="py-1">
      <CustomerPageLink href={courseMode ? `/dashboard/courses?view=customers&customerId=${encodeURIComponent(row.id)}` : `/dashboard/customers/${encodeURIComponent(row.id)}`} className="inline-flex min-h-11 items-center break-words font-medium text-primary-800">{row.name}</CustomerPageLink>
      <p className="text-sm text-earth-500">{row.phone || "未提供電話"}</p>
    </div> },
    ...metrics.map(metric => {
      const params = new URLSearchParams(query);
      params.set("sort", metric);
      params.set("direction", filters.sort === metric && filters.direction === "desc" ? "asc" : "desc");
      return { key: metric, align: "right" as const, width: "min-w-28", header:
        <DashboardLink href={`${CONSUMPTION_PATH}?${params}`} className="inline-flex min-h-11 items-center gap-1 whitespace-nowrap" aria-label={`依${CONSUMPTION_METRICS[metric]}${params.get("direction") === "asc" ? "由少到多" : "由多到少"}排序`}>
          {CONSUMPTION_METRICS[metric]}{filters.sort === metric ? filters.direction === "asc" ? " ↑" : " ↓" : " ↕"}
        </DashboardLink>,
        accessor: (row: ConsumptionRow) => <span className="whitespace-nowrap tabular-nums">{metric === "amount" || metric === "paid" ? "NT$ " : ""}{row[metric].toLocaleString("zh-TW", { maximumFractionDigits: 2 })}</span>,
      };
    }),
    { key: "balances", header: "目前方案餘額", width: "min-w-64", priority: "secondary", accessor: row => <details className="max-w-sm py-1">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm">{row.balances ? "查看目前餘額與到期日" : "無有效方案"}</summary>
      {row.balances && <p className="whitespace-pre-line break-words pb-2 text-sm">{row.balances.split("；").join("\n")}</p>}
    </details> },
  ];
  return <section aria-label="期間消耗結果" className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="font-semibold text-earth-900">符合條件 {matched.toLocaleString()} 位顧客{filters.top ? `・取前 ${total.toLocaleString()} 位` : ""}</p>
        <p className="text-sm text-earth-500">{filters.startDate}～{filters.endDate}・{CONSUMPTION_METRICS[filters.sort]}{filters.direction === "asc" ? "由少到多" : "由多到少"}</p></div>
      {canExport && <a href={`/api/export/customer-consumption-summary?${query}`} className="inline-flex min-h-11 items-center rounded-lg border border-earth-300 bg-white px-3 text-sm font-medium text-earth-700">匯出名單 CSV</a>}
    </div>
    <DataTable columns={columns} rows={rows} rowKey={row => row.id} empty={<p className="px-4 py-10 text-center text-earth-600">沒有符合條件的資料，請調整期間或篩選條件。</p>} />
    <nav aria-label="消耗統計分頁" className="flex flex-wrap items-center justify-between gap-2 text-sm">
      {page > 1 ? <DashboardLink href={pageHref(page - 1)} className="inline-flex min-h-11 items-center px-3 text-primary-700">上一頁</DashboardLink> : <span />}
      <span className="text-earth-600">第 {page}／{pages} 頁・每頁 {CONSUMPTION_PAGE_SIZE} 人</span>
      {page < pages ? <DashboardLink href={pageHref(page + 1)} className="inline-flex min-h-11 items-center px-3 text-primary-700">下一頁</DashboardLink> : <span />}
    </nav>
  </section>;
}
