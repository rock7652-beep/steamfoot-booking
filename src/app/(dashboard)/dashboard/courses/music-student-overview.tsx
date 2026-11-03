"use client";

import { useSearchParams } from "next/navigation";
import { studentMakeupsHref, studentCourseHref } from "@/lib/music-student-navigation";
import { useEffect, useState } from "react";
import { DashboardLink } from "@/components/dashboard-link";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { loadMusicStudentWorkspace } from "@/server/actions/music-student-workspace";
import { formatTWDateTime, toLocalDateStr } from "@/lib/date-utils";

type Result = Awaited<ReturnType<typeof loadMusicStudentWorkspace>>;
export function MusicStudentOverview({ customerId, tab }: { customerId: string; tab: string; legacy?: boolean }) {
  const params = useSearchParams();
  const reader = usePanelReader("music-student-workspace", loadMusicStudentWorkspace);
  const [result, setResult] = useState<{ id: string; value: Result } | null>(null);
  const [retry, setRetry] = useState(0);
  const includeTuition = tab === "payments";
  useEffect(() => {
    let active = true;
    reader.read(customerId, includeTuition).then(value => { if (active) setResult({ id: customerId, value }); })
      .catch(() => { if (active) setResult({ id: customerId, value: { success: false, error: "讀取未完成，請重試。" } }); });
    return () => { active = false; };
  }, [reader, customerId, retry, includeTuition]);
  const value = result?.id === customerId ? result.value : null;
  const link = "inline-flex min-h-11 items-center rounded-lg border border-earth-200 px-3 py-2 text-sm text-primary-800";
  if (tab !== "info" && tab !== "makeups") return null;
  if (!value) return <p role="status" className="mb-3 text-sm text-earth-600">讀取學員堂數與課表…</p>;
  if (!value.success) return <p role="alert" className="mb-3 text-sm text-red-700">{value.error}<button type="button" className="min-h-11 px-3 underline" onClick={() => { setResult(null); reader.invalidate(customerId, includeTuition); setRetry(n => n + 1); }}>重新讀取</button></p>;
  const { balance, next } = value.data;
  return <section className="mb-2 space-y-2 text-sm" aria-label="學員概況">
    {tab === "info" && <><div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg bg-primary-50 p-3">
      {balance && <><span>一般剩餘 <strong>{balance.remaining}</strong> 堂</span><span>已排 <strong>{balance.held}</strong> 堂</span><span>可再預約 <strong>{balance.available}</strong> 堂</span></>}
      {!!balance?.makeupRemaining && <span>另發補課 <strong>{balance.makeupRemaining}</strong> 堂</span>}
    </div>

    {!!balance?.issues && <p role="status" className="text-amber-800">{balance.issues} 個方案尚待核對，可預約堂數已依目前可用額度顯示。</p>}
    {value.data.canReadBookings && <p>{next ? <DashboardLink className="inline-flex min-h-11 items-center text-primary-800 underline" href={studentCourseHref(customerId, toLocalDateStr(new Date(next.date)), next.id, params.toString())}>下次上課：{formatTWDateTime(new Date(next.date))} · {next.name}</DashboardLink> : "尚未安排下次課程"}</p>}</>}
    {tab === "makeups" && <section className="space-y-3"><h3 className="font-semibold">請假與補課進度</h3><DashboardLink className={link} href={studentMakeupsHref(customerId, params.toString())}>查看全部請假／安排補課</DashboardLink></section>}
  </section>;
}
