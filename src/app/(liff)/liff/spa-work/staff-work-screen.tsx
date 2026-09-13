"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { fetchLiffStaffWork, type LiffStaffWorkRow } from "@/server/actions/spa-liff-staff-work";
import { refreshLiffSession } from "@/lib/liff/session-refresh";
import { getIDToken, initLiff, isInLineClient } from "@/lib/liff/client";

type ReadyState = { staffName: string; selectedDate: string; rows: LiffStaffWorkRow[]; monthCounts: Record<string, number> };
type ScreenState = "loading" | "no_access" | "unavailable" | ReadyState;

function shiftDate(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function weekDates(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  const sunday = shiftDate(date, -value.getUTCDay());
  return Array.from({ length: 7 }, (_, index) => shiftDate(sunday, index));
}

const statusLabel: Record<string, string> = { PENDING: "待確認", CONFIRMED: "已預約", COMPLETED: "已完成" };

export function StaffWorkScreen({ storeName, storeSlug, liffId, today }: { storeName: string; storeSlug: string; liffId: string; today: string }) {
  const [state, setState] = useState<ScreenState>("loading");
  const [pending, startTransition] = useTransition();
  const selectedDateRef = useRef<string | undefined>(undefined);

  const load = useCallback(async (date?: string) => {
    const result = await fetchLiffStaffWork(date ? { date } : undefined);
    if (result.status === "ok") {
      selectedDateRef.current = result.selectedDate;
      setState({ staffName: result.staffName, selectedDate: result.selectedDate, rows: result.rows, monthCounts: result.monthCounts });
      localStorage.setItem(`spa-member-mode:${storeSlug}`, "work");
      return true;
    }
    setState(result.status === "no_access" ? "no_access" : "unavailable");
    return false;
  }, [storeSlug]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (await load() || cancelled) return;
      try {
        await initLiff(liffId);
        if (!isInLineClient()) return;
        const idToken = getIDToken();
        if (!idToken) return;
        const session = await refreshLiffSession({ idToken, storeSlug });
        if (!cancelled && session.status === "session_created") await load();
      } catch {
        if (!cancelled) setState("unavailable");
      }
    })();
    const refresh = () => { if (document.visibilityState === "visible") void load(selectedDateRef.current); };
    document.addEventListener("visibilitychange", refresh);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", refresh); };
  }, [liffId, load, storeSlug]);

  if (state === "loading") return <Boundary title="正在讀取工作行程" />;
  if (state === "unavailable") return <Boundary title="目前無法讀取工作資料" retry />;
  if (state === "no_access") return <Boundary title="尚未取得本店工作權限"><p className="text-sm text-earth-600">請由店長從本店會員加入服務人員；若剛完成設定，請重新登入。</p><button onClick={() => signIn("line", { callbackUrl: `/s/${storeSlug}/liff/spa-work` })} className="mt-4 min-h-12 w-full rounded-xl bg-primary-700 px-4 font-semibold text-white">使用 LINE 登入</button><Link href={`/s/${storeSlug}/book`} className="mt-3 block text-center text-sm text-primary-700">返回會員專區</Link></Boundary>;

  const dates = weekDates(state.selectedDate);
  return <main className="mx-auto min-h-screen max-w-md bg-[#f8f5ee] px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-earth-900">
    <header><p className="text-xs font-semibold tracking-[0.12em] text-primary-700">{storeName}</p><div className="mt-2 flex items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">我的工作</h1><p className="mt-1 text-sm text-earth-500">{state.staffName}</p></div><Link href={`/s/${storeSlug}/book`} onClick={() => localStorage.setItem(`spa-member-mode:${storeSlug}`, "member")} className="rounded-full border border-earth-300 bg-white px-4 py-2 text-sm font-medium">會員專區</Link></div></header>
    <nav aria-label="選擇日期" className="mt-5 grid grid-cols-7 gap-1 rounded-2xl bg-white p-2 shadow-sm">{dates.map((date) => { const selected = date === state.selectedDate; return <button key={date} disabled={pending} onClick={() => startTransition(() => { void load(date); })} className={`min-h-14 rounded-xl px-1 py-2 text-center ${selected ? "bg-primary-700 text-white" : "text-earth-700"}`}><span className="block text-[11px]">{["日","一","二","三","四","五","六"][new Date(`${date}T00:00:00Z`).getUTCDay()]}</span><strong className="mt-1 block text-sm">{Number(date.slice(-2))}</strong></button>; })}</nav>
    <section className="mt-5"><div className="flex items-end justify-between"><div><p className="text-sm font-medium text-primary-700">{state.selectedDate === today ? "今日工作" : "當日工作"}</p><h2 className="mt-1 text-xl font-bold">{state.selectedDate.replaceAll("-", " / ")}</h2></div><input aria-label="跳到日期" type="date" value={state.selectedDate} onChange={(event) => startTransition(() => { void load(event.target.value); })} className="max-w-36 rounded-xl border border-earth-200 bg-white px-3 py-2 text-sm" /></div>
      <div className="mt-4 space-y-3">{state.rows.length ? state.rows.map((row) => <article key={row.id} className="rounded-2xl bg-white p-4 shadow-[0_6px_20px_rgba(74,66,53,0.07)]"><div className="flex items-start justify-between gap-3"><div><p className="text-lg font-bold tabular-nums">{row.startTime}–{row.endTime}</p><h3 className="mt-2 font-semibold">{row.customerName}</h3></div><span className="rounded-full bg-earth-100 px-3 py-1 text-xs">{statusLabel[row.status] ?? row.status}</span></div><dl className="mt-3 grid gap-2 text-sm text-earth-600"><div><dt className="inline text-earth-400">服務：</dt><dd className="inline">{row.serviceName}</dd></div><div><dt className="inline text-earth-400">位置：</dt><dd className="inline">{row.locationName}</dd></div>{row.note && <div><dt className="inline text-earth-400">備註：</dt><dd className="inline break-words">{row.note}</dd></div>}</dl></article>) : <div className="rounded-2xl border border-dashed border-earth-300 bg-white/70 px-5 py-10 text-center"><p className="font-medium">這一天沒有安排顧客</p><p className="mt-2 text-sm text-earth-500">空檔不代表已開放接單，請依店內班表為準。</p></div>}</div>
    </section>
  </main>;
}

function Boundary({ title, children, retry }: { title: string; children?: React.ReactNode; retry?: boolean }) {
  return <main className="mx-auto max-w-md px-5 py-16 text-center"><h1 className="text-xl font-bold text-earth-900">{title}</h1>{children}{retry && <button className="mt-5 rounded-xl border border-earth-300 px-5 py-3" onClick={() => location.reload()}>重新整理</button>}</main>;
}
