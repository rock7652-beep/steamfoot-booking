"use client";

import { useSearchParams } from "next/navigation";
import { studentMakeupsHref } from "@/lib/music-student-navigation";
import { useEffect, useState } from "react";
import { DashboardLink } from "@/components/dashboard-link";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { loadMusicStudentWorkspace } from "@/server/actions/music-student-workspace";
import { formatTWDateTime, toLocalDateStr } from "@/lib/date-utils";

type Result = Awaited<ReturnType<typeof loadMusicStudentWorkspace>>;
export function MusicStudentOverview({ customerId, tab }: { customerId: string; tab: string }) {
  const params = useSearchParams();
  const reader = usePanelReader("music-student-workspace", loadMusicStudentWorkspace);
  const [result, setResult] = useState<{ id: string; value: Result } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    reader.read(customerId).then(value => { if (active) setResult({ id: customerId, value }); })
      .catch(() => { if (active) setResult({ id: customerId, value: { success: false, error: "讀取未完成，請重試。" } }); });
    return () => { active = false; };
  }, [reader, customerId, retry]);
  const value = result?.id === customerId ? result.value : null;
  const link = "inline-flex min-h-11 items-center rounded-lg border border-earth-200 px-3 py-2 text-sm text-primary-800";
  if (!value) return <p role="status" className="mb-3 text-sm text-earth-600">讀取學員堂數與課表…</p>;
  if (!value.success) return <p role="alert" className="mb-3 text-sm text-red-700">{value.error}<button type="button" className="min-h-11 px-3 underline" onClick={() => { setResult(null); reader.invalidate(customerId); setRetry(n => n + 1); }}>重新讀取</button></p>;
  const { balance, next, tuition, opening } = value.data;
  return <section className="mb-4 space-y-3 text-sm" aria-label="學員概況">
    <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg bg-primary-50 p-3">
      {balance && <><span>一般剩餘 <strong>{balance.remaining}</strong> 堂</span><span>已排 <strong>{balance.held}</strong> 堂</span><span>可再預約 <strong>{balance.available}</strong> 堂</span></>}
      {opening && <span>音教雲待補 <strong>{opening.opening.outstanding}</strong> 堂</span>}
      {!!balance?.makeupRemaining && <span>另發補課 <strong>{balance.makeupRemaining}</strong> 堂</span>}
    </div>
    {balance && <p className="text-earth-600">一般剩餘包含已排課程；可再預約是扣除已排後的堂數。補課另列。</p>}
    {!!balance?.issues && <p role="status" className="text-amber-800">{balance.issues} 個方案尚待核對，可預約堂數已依目前可用額度顯示。</p>}
    {value.data.canReadBookings && <p>{next ? <DashboardLink className="inline-flex min-h-11 items-center text-primary-800 underline" href={`/dashboard/courses?date=${toLocalDateStr(new Date(next.date))}&action=booking&session=${encodeURIComponent(next.id)}`}>下次上課：{formatTWDateTime(new Date(next.date))} · {next.name}</DashboardLink> : "尚未安排下次課程"}</p>}
    {tab === "payments" && tuition && <section className="space-y-2 rounded-lg border p-3" aria-label="音教雲付款紀錄"><h3 className="font-semibold">音教雲歷史付款</h3><p>已收 NT$ {tuition.paid.toLocaleString()} · 來源欠款 NT$ {tuition.receivable.toLocaleString()}</p><p className="text-earth-600">以下保留原付款日期，不計入今日收款。</p>{tuition.payments.map((payment, index) => <p key={index}>{payment.date} · {payment.method} · NT$ {payment.amount.toLocaleString()}</p>)}{!tuition.payments.length && <p>此學員沒有來源付款紀錄。</p>}</section>}
    {tab === "makeups" && <section className="space-y-3"><h3 className="font-semibold">請假與補課進度</h3>{opening?.rows.map(row => <div key={row.id} className="space-y-1 rounded-lg border p-3"><p>{row.sourceDate} 原課請假 · {row.label}</p><p>{row.state === "ATTENDED" ? "已完成補課" : row.state === "RESERVED" ? "已安排補課" : "待安排補課"} · {row.expiry ? `期限 ${row.expiry}` : "已確認無期限"}</p>{row.booking && <p>補課：{formatTWDateTime(new Date(row.booking.date))} · {row.booking.sessionName}</p>}</div>)}<DashboardLink className={link} href={studentMakeupsHref(customerId, params.toString())}>查看全部請假／安排補課</DashboardLink></section>}
  </section>;
}
