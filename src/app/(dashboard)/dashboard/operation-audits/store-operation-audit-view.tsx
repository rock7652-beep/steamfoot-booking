import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageHeader, PageShell } from "@/components/desktop";
import { AuditChanges } from "@/components/audit-changes";
import { auditTimeLabel } from "./audit-list-format";
import { dayRange } from "@/lib/date-utils";
import { readStoreOperationAudits } from "@/server/services/store-operation-audit-reader";

export async function StoreOperationAuditView({ storeId, dateFrom, dateTo, page }: {
  storeId: string; dateFrom: string; dateTo: string; page: number;
}) {
  const result = await readStoreOperationAudits({ storeId, dateFrom: dayRange(dateFrom).start, dateTo: dayRange(dateTo).end, page });
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const href = (next: number) => `/dashboard/operation-audits?${new URLSearchParams({ dateFrom, dateTo, page: String(next) })}`;
  return <PageShell compact>
    <PageHeader title="操作紀錄" compact />
    <form className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
      <span className="text-earth-600">日期</span>
      <input aria-label="開始日期" className="h-11 min-w-0 w-[145px] rounded-lg border border-earth-200 bg-white px-2" type="date" name="dateFrom" defaultValue={dateFrom} required />
      <span className="text-earth-400">至</span>
      <input aria-label="結束日期" className="h-11 min-w-0 w-[145px] rounded-lg border border-earth-200 bg-white px-2" type="date" name="dateTo" defaultValue={dateTo} required />
      <button className="min-h-11 rounded-lg border border-earth-200 bg-white px-3 text-primary-800" type="submit">查詢</button>
    </form>
    <div className="@container min-w-0 overflow-hidden rounded-xl border border-earth-200 bg-white">
      <div className="flex items-center justify-between border-b border-earth-100 px-3 py-2 text-sm text-earth-600">
        <span>共 {result.total} 筆</span><span>第 {result.page}／{pages} 頁</span>
      </div>
      <div aria-hidden="true" className="hidden grid-cols-[96px_150px_minmax(0,1fr)_20px] gap-x-3 border-b border-earth-100 bg-earth-50 px-3 py-2 text-sm text-earth-500 @[640px]:grid">
        <span>時間</span><span>操作人員</span><span>操作內容</span><span />
      </div>
      <div className="divide-y divide-earth-100">
        {result.items.length === 0 ? <p className="px-3 py-6 text-sm text-earth-500">指定期間尚無操作紀錄</p> : result.items.map((item, index) => <details key={item.id} className="group px-3 open:bg-primary-50/40">
          <summary className="grid min-h-11 cursor-pointer list-none grid-cols-[96px_minmax(0,1fr)_20px] items-center gap-x-3 gap-y-1 py-2 text-sm [&::-webkit-details-marker]:hidden @[640px]:grid-cols-[96px_150px_minmax(0,1fr)_20px]">
            <time dateTime={new Date(item.createdAt).toISOString()} className="self-start whitespace-nowrap text-earth-500">{auditTimeLabel(new Date(item.createdAt), index > 0 ? new Date(result.items[index - 1].createdAt) : undefined)}</time>
            <span className="min-w-0 break-words text-earth-700">{item.actorNameSnapshot ?? item.actor.name}</span>
            <span className="col-start-2 min-w-0 break-words font-medium text-primary-900 @[640px]:col-start-auto">{item.summary}</span>
            <span aria-hidden="true" className="col-start-3 row-start-1 text-right text-earth-400 group-open:rotate-180 @[640px]:col-start-auto">⌄</span>
          </summary>
          <div className="border-t border-earth-100 py-3 text-sm">
            <p className="mb-2 text-earth-500">{new Date(item.createdAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false })}</p>
            <AuditChanges target={item.targetLabel} before={item.beforeJson} after={item.afterJson} />
          </div>
        </details>)}
      </div>
    </div>
    <nav className="flex flex-wrap items-center justify-end gap-2 text-sm" aria-label="操作紀錄分頁">
      {result.page > 1 ? <Link className="inline-flex min-h-11 items-center rounded-lg border border-earth-200 bg-white px-3 text-primary-800" href={href(result.page - 1)}>上一頁</Link> : null}
      {result.page < pages ? <Link className="inline-flex min-h-11 items-center rounded-lg border border-earth-200 bg-white px-3 text-primary-800" href={href(result.page + 1)}>下一頁</Link> : null}
    </nav>
  </PageShell>;
}
