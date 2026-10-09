import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageHeader, PageShell } from "@/components/desktop";
import { AuditChanges } from "@/components/audit-changes";
import { dayRange } from "@/lib/date-utils";
import { readStoreOperationAudits } from "@/server/services/store-operation-audit-reader";

export async function StoreOperationAuditView({ storeId, dateFrom, dateTo, page }: {
  storeId: string; dateFrom: string; dateTo: string; page: number;
}) {
  const result = await readStoreOperationAudits({ storeId, dateFrom: dayRange(dateFrom).start, dateTo: dayRange(dateTo).end, page });
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const href = (next: number) => `/dashboard/operation-audits?${new URLSearchParams({ dateFrom, dateTo, page: String(next) })}`;
  return <PageShell>
    <PageHeader title="操作紀錄" compact />
    <form className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-sm">開始日期<input className="min-h-11 rounded border px-3" type="date" name="dateFrom" defaultValue={dateFrom} required /></label>
      <label className="grid gap-1 text-sm">結束日期<input className="min-h-11 rounded border px-3" type="date" name="dateTo" defaultValue={dateTo} required /></label>
      <button className="min-h-11 rounded border px-4" type="submit">查詢</button>
    </form>
    <p className="text-sm text-earth-600">本店業務操作，共 {result.total} 筆。僅顯示門市業務欄位，私人備註與安全資訊不提供。</p>
    <div className="divide-y rounded-xl border bg-white">
      {result.items.length === 0 ? <p className="p-6 text-earth-500">指定期間尚無操作紀錄</p> : result.items.map(item => <details key={item.id} className="p-3">
        <summary className="min-h-11 cursor-pointer break-words text-sm">
          <time>{new Date(item.createdAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false })}</time>
          <span className="mx-3">{item.actorNameSnapshot ?? item.actor.name}</span>
          <span className="font-medium">{item.summary}</span>
        </summary>
        <AuditChanges target={item.targetLabel} before={item.beforeJson} after={item.afterJson} />
      </details>)}
    </div>
    <nav className="flex flex-wrap items-center justify-end gap-3" aria-label="操作紀錄分頁">
      <span className="text-sm">第 {result.page}／{pages} 頁</span>
      {result.page > 1 ? <Link className="min-h-11 rounded border p-3" href={href(result.page - 1)}>上一頁</Link> : null}
      {result.page < pages ? <Link className="min-h-11 rounded border p-3" href={href(result.page + 1)}>下一頁</Link> : null}
    </nav>
  </PageShell>;
}
