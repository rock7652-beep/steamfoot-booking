"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DashboardLink } from "@/components/dashboard-link";
import { createCourseBooking } from "@/server/actions/course-members";
import { formatTWDateTime, toLocalDateStr } from "@/lib/date-utils";
import type { MusicLeaveWorkspace } from "@/server/queries/music-leave-workspace";

const button = "inline-flex min-h-11 items-center rounded-lg border border-earth-200 px-3 py-2 text-sm text-primary-800 disabled:opacity-50";
export function NativeMakeupList({ data, canCreate }: { data: MusicLeaveWorkspace; canCreate: boolean }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("pending");
  const rows = data.rows.filter(row => `${row.customerName} ${row.name}`.includes(search.trim()) && (status === "all" || ["待安排", "需處理"].includes(row.state)));
  return <section className="min-w-0 space-y-3" aria-labelledby="native-makeups-title">
    <h2 id="native-makeups-title" className="font-semibold">蒸管家請假與補課</h2>
    <div className="flex flex-wrap gap-2"><input aria-label="搜尋請假學員或課程" placeholder="搜尋學員／課程" className="min-h-11 min-w-0 flex-1 rounded-lg border px-3 text-base" value={search} onChange={e => setSearch(e.target.value)} /><select aria-label="補課處理狀態" className="min-h-11 rounded-lg border px-3 text-sm" value={status} onChange={e => setStatus(e.target.value)}><option value="pending">待安排／需處理</option><option value="all">全部紀錄</option></select></div>
    {data.truncated && <p role="status" className="text-sm text-amber-800">目前顯示最近 1,000 筆請假，請選擇學員查看完整範圍。</p>}
    {data.sessionsTruncated && <p role="status" className="text-sm text-amber-800">可選時段顯示最近 500 堂，其餘時段請由課表安排。</p>}
    {rows.map(row => <NativeRow key={row.id} row={row} canCreate={canCreate} />)}
    {!rows.length && <p className="rounded-lg border p-4 text-sm text-earth-600">{status === "pending" ? "目前沒有符合條件的待安排補課。可切換全部紀錄查看已安排與已完成項目。" : "沒有符合條件的請假紀錄。"}</p>}
  </section>;
}
function NativeRow({ row, canCreate }: { row: MusicLeaveWorkspace["rows"][number]; canCreate: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false), [sessionId, setSessionId] = useState(""), [requestKey, setRequestKey] = useState(""), [error, setError] = useState("");
  const [pending, start] = useTransition();
  return <article className="space-y-2 rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><DashboardLink className="inline-flex min-h-11 items-center font-semibold text-primary-800 underline" href={`/dashboard/courses?view=customers&customerId=${encodeURIComponent(row.customerId)}&studentTab=makeups`}>{row.customerName}</DashboardLink><span className="ml-2">{row.name}</span></div><span className="rounded bg-earth-100 px-2 py-1">{row.state}</span></div>
    <p>原課 {formatTWDateTime(new Date(row.date))} · {row.separate ? "已扣原堂，另給補課" : "沿用原方案補課"} · {row.expiry ? `期限 ${toLocalDateStr(new Date(row.expiry))}` : "期限請查看原方案"}</p>
    {row.issue && <p role="status" className="text-amber-800">{row.issue}</p>}
    <div className="flex flex-wrap gap-2"><DashboardLink className={button} href={`/dashboard/courses?date=${row.sourceDate}&action=booking&session=${encodeURIComponent(row.sourceSessionId)}`}>查看原課／更正點名</DashboardLink>
      {row.booking && <DashboardLink className={button} href={`/dashboard/courses?date=${toLocalDateStr(new Date(row.booking.date))}&action=booking&session=${encodeURIComponent(row.booking.id)}`}>補課 {formatTWDateTime(new Date(row.booking.date))}／點名</DashboardLink>}
      {canCreate && row.state === "待安排" && !row.issue && !open && <button type="button" className={button} onClick={() => { setOpen(true); setRequestKey(crypto.randomUUID()); }}>安排補課</button>}
    </div>
    {open && <form className="space-y-2 border-t pt-3" onSubmit={event => { event.preventDefault(); if (pending || !row.cardId || !sessionId) return; start(async () => { try { const result = await createCourseBooking({ sessionId, customerId: row.customerId, cardId: row.cardId, makeupForBookingId: row.separate ? null : row.id, requestKey }); if (!result.success) { setError(result.error ?? "未能安排，請重試"); return; } setOpen(false); setError(""); router.refresh(); } catch { setError("連線未完成，選擇已保留，請重試。"); } }); }}>
      <label className="block">補課時段<select aria-label={`${row.customerName} 補課時段`} disabled={pending} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border px-3" value={sessionId} onChange={e => { setSessionId(e.target.value); setError(""); }}><option value="">選擇同課程、期限內的時段</option>{row.sessions.map(s => <option key={s.id} value={s.id}>{formatTWDateTime(new Date(s.date))} · {s.name}</option>)}</select></label>
      {!row.sessions.length && <p>目前沒有符合條件的未來課堂，請先到課表新增時段。</p>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="flex gap-2"><button className={button} disabled={pending || !sessionId}>{pending ? "安排中…" : "確認安排"}</button><button type="button" className={button} disabled={pending} onClick={() => setOpen(false)}>取消</button></div>
    </form>}
  </article>;
}
