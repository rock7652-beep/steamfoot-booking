"use client";
import { backgroundRefreshAllowed } from "@/lib/background-refresh";

import { useEffect, useState } from "react";
import { useRouter } from "@/components/use-stable-router";
import { toLocalDateStr } from "@/lib/date-utils";
import type { RetentionMetric } from "@/server/queries/retention-metrics";
import type { retentionPresentation } from "@/lib/retention-presentation";

type Customer = { id: string; name: string; phone: string | null; returned: boolean; booked: boolean };
export function RetentionSection({ presentation, returned, pending, rate, customers }: {
  presentation: ReturnType<typeof retentionPresentation>;
  returned: RetentionMetric; pending: RetentionMetric; rate: RetentionMetric;
  customers: Customer[] | null;
}) {
  const router = useRouter();
  useEffect(() => {
    let day = toLocalDateStr();
    let lastRefresh = Date.now();
    const refresh = () => {
      if (!backgroundRefreshAllowed()) return;
      const nextDay = toLocalDateStr();
      if (nextDay !== day || Date.now() - lastRefresh >= 60_000) {
        day = nextDay; lastRefresh = Date.now(); router.refresh();
      }
    };
    const timer = setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("focus", refresh); };
  }, [router]);
  const [segment, setSegment] = useState<"returned" | "pending" | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const base = returned.current + pending.current;
  const rows = customers?.filter(c => c.returned === (segment === "returned") && `${c.name} ${c.phone ?? ""}`.toLowerCase().includes(search.toLowerCase())) ?? [];
  function toggle(next: "returned" | "pending") { setSegment(segment === next ? null : next); setSearch(""); setPage(0); }
  return <section aria-labelledby="retention-analysis-title" className="min-w-0 rounded-xl border border-earth-200 bg-white p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="retention-analysis-title" className="font-semibold text-earth-800">{presentation.title}</h2><span className="text-earth-500">{presentation.progress}</span></div>
    <p className="mt-1 text-earth-600">{presentation.description}</p>
    <div className="mt-3 grid gap-2 sm:grid-cols-3">
      <div className="rounded-lg bg-earth-50 p-3"><p className="text-earth-600">回流率</p><p className="mt-1 text-xl font-bold text-earth-900">{base ? `${rate.current.toFixed(1)}%` : "暫無資料"}</p><p className="mt-1 text-earth-600">{presentation.base} {base} 人・已回來 {returned.current} 人</p></div>
      {([['returned', '已回訪', returned.current], ['pending', '尚未回訪', pending.current]] as const).map(([key, label, count]) => <button key={key} type="button" disabled={!customers || !base} aria-expanded={segment === key} aria-controls="retention-customers" onClick={() => toggle(key)} className={`min-h-11 rounded-lg p-3 text-left disabled:cursor-default ${segment === key ? 'bg-primary-50 ring-1 ring-primary-600' : 'bg-earth-50'}`}><span className="block text-earth-600">{label}</span><span className="mt-1 block text-xl font-bold text-earth-900">{count} 人</span>{customers && base > 0 && <span className="mt-1 block text-primary-700">{segment === key ? '收合名單' : '展開名單'}</span>}</button>)}
    </div>
    <p className="mt-2 text-earth-500">僅計完成服務，每位顧客計一次。</p>
    {segment && customers && <div id="retention-customers" className="mt-3 border-t border-earth-200 pt-3">
      <label className="flex flex-wrap items-center gap-2"><span>{segment === 'returned' ? '已回訪' : '尚未回訪'} {rows.length} 人</span><input aria-label="搜尋回訪顧客" placeholder="搜尋姓名／電話" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className="min-h-11 min-w-0 flex-1 rounded-lg border border-earth-300 px-3" /></label>
      <ul className="mt-2 divide-y divide-earth-100">{rows.slice(page * 20, (page + 1) * 20).map(c => <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><div className="min-w-0 break-words"><span className="font-medium text-earth-900">{c.name}</span>{c.phone && <span className="ml-2 text-earth-600">{c.phone}</span>}</div>{!c.returned && <span className={c.booked ? 'text-primary-700' : 'text-earth-500'}>{c.booked ? '已有預約' : '尚未預約'}</span>}</li>)}</ul>
      {!rows.length && <p className="py-3 text-earth-500">沒有符合條件的顧客</p>}
      {rows.length > 20 && <div className="flex items-center justify-end gap-3"><button type="button" className="min-h-11 px-3 disabled:opacity-40" disabled={page === 0} onClick={() => setPage(page - 1)}>上一頁</button><span>{page + 1}／{Math.ceil(rows.length / 20)}</span><button type="button" className="min-h-11 px-3 disabled:opacity-40" disabled={(page + 1) * 20 >= rows.length} onClick={() => setPage(page + 1)}>下一頁</button></div>}
    </div>}
    <details className="mt-2 text-earth-500"><summary className="flex min-h-11 cursor-pointer items-center">統計區間與比較</summary><p className="break-words">{presentation.dates}</p>{base > 0 && <p className="mt-1">較前期 {rate.mom.percentage === null ? '暫無比較資料' : `${rate.mom.difference > 0 ? '+' : ''}${rate.mom.difference.toFixed(1)} 個百分點`}・去年同期 {rate.yoy.percentage === null ? '暫無比較資料' : `${rate.yoy.difference > 0 ? '+' : ''}${rate.yoy.difference.toFixed(1)} 個百分點`}</p>}</details>
  </section>;
}
