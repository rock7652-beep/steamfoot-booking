"use client";
import { useRef, useState, type ReactNode } from "react";
import { DashboardLink } from "@/components/dashboard-link";
import { analysisComparisonRanges } from "@/lib/date-utils";

type Result = { rows: { id: string; name: string; detail: string; href: string }[]; total: number; attendees?: number; page: number; pageSize: number };
export function AnalysisDetailLink({ href, children, className, title = "分析明細" }: { href: string; children: ReactNode; className?: string; title?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isDetail = href.startsWith("/dashboard/growth?") || href.startsWith("/analysis-details?");
  const query = new URLSearchParams(href.split("?")[1]);
  const startDate = query.get("startDate") ?? "";
  const endDate = query.get("endDate") ?? "";
  const effectiveEnd = startDate && endDate ? analysisComparisonRanges({ startDate, endDate }, query.get("preset") ?? "custom").current.endDate : endDate;
  async function load(page = 1) {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams(href.split("?")[1]); params.set("page", String(page));
      const response = await fetch(`/api/reports/analysis-details?${params}`, { signal: controller.signal, cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "讀取失敗");
      setResult(body);
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "讀取失敗"); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  if (!isDetail) return <DashboardLink href={href} className={className}>{children}</DashboardLink>;
  return <>
    <button type="button" className={`${className ?? ""} text-left`} onClick={() => { setResult(null); dialog.current?.showModal(); void load(); }}>{children}</button>
    <dialog ref={dialog} onClose={() => request.current?.abort()} className="fixed inset-0 m-auto max-h-[80dvh] w-[min(44rem,92vw)] overflow-y-auto rounded-xl border border-earth-200 bg-white p-4 text-earth-900 shadow-xl backdrop:bg-black/40">
      <div className="sticky top-0 flex items-center justify-between gap-3 bg-white pb-3"><h2 className="font-semibold">{title}</h2><button type="button" onClick={() => dialog.current?.close()} className="rounded border border-earth-300 px-3 py-1.5">關閉</button></div>
      <p className="text-xs text-earth-500">統計日期：{startDate}～{effectiveEnd}</p>
      {loading && <p role="status" className="py-3">讀取中…</p>}
      {error && <p role="alert" className="py-3 text-red-700">{error} <button type="button" onClick={() => void load()} className="underline">重試</button></p>}
      {result && !loading && !error && <>
        <p className="py-2 text-sm">{result.attendees !== undefined ? `共 ${result.total} 筆服務紀錄，合計 ${result.attendees} 人次` : `共 ${result.total} 位顧客`}</p>
        {result.rows.length === 0 ? <p className="py-5 text-earth-500">這段日期沒有符合的資料。</p> : result.rows.map(row => <div key={row.id} className="flex items-center justify-between gap-3 border-t border-earth-100 py-2 text-sm"><DashboardLink href={row.href} className="text-primary-700">{row.name}</DashboardLink><span className="text-earth-600">{row.detail}</span></div>)}
        {result.total > result.pageSize && <div className="mt-3 flex justify-between"><button disabled={result.page === 1} onClick={() => void load(result.page - 1)}>上一頁</button><span>第 {result.page} 頁</span><button disabled={result.page * result.pageSize >= result.total} onClick={() => void load(result.page + 1)}>下一頁</button></div>}
      </>}
    </dialog>
  </>;
}
