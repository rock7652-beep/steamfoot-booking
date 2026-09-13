"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  fetchLiffStaffWork,
  type LiffStaffWorkCalendarDay,
  type LiffStaffWorkRow,
} from "@/server/actions/spa-liff-staff-work";
import { refreshLiffSession } from "@/lib/liff/session-refresh";
import { getIDToken, initLiff, isInLineClient } from "@/lib/liff/client";

type ReadyState = {
  staffName: string;
  selectedDate: string;
  rows: LiffStaffWorkRow[];
  calendarDays: LiffStaffWorkCalendarDay[];
};
type ScreenState = "loading" | "no_access" | "unavailable" | ReadyState;

function monthTarget(date: string, offset: number) {
  const [year, month] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function weekday(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

const statusLabel: Record<string, string> = {
  PENDING: "待確認",
  CONFIRMED: "已預約",
  COMPLETED: "已完成",
  NO_SHOW: "未到店",
};

export function StaffWorkScreen({ storeName, storeSlug, liffId, today }: { storeName: string; storeSlug: string; liffId: string; today: string }) {
  const [state, setState] = useState<ScreenState>("loading");
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const selectedDateRef = useRef<string | undefined>(undefined);

  const load = useCallback(async (date?: string) => {
    const result = await fetchLiffStaffWork(date ? { date } : undefined);
    if (result.status === "ok") {
      selectedDateRef.current = result.selectedDate;
      setState({ staffName: result.staffName, selectedDate: result.selectedDate, rows: result.rows, calendarDays: result.calendarDays });
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
  if (state === "no_access") {
    const returnTo = `/s/${storeSlug}/liff/spa-work`;
    const loginUrl = `/api/line-oauth/mobile/start?storeSlug=${encodeURIComponent(storeSlug)}&returnTo=${encodeURIComponent(returnTo)}`;
    return <Boundary title="尚未取得本店工作權限"><p className="text-sm text-earth-600">請由店長從本店會員加入服務人員；若剛完成設定，請重新登入。</p><a href={loginUrl} className="mt-4 block min-h-12 w-full rounded-xl bg-primary-700 px-4 py-3 font-semibold text-white">使用 LINE 登入</a><Link href={`/s/${storeSlug}/book`} className="mt-3 block text-center text-sm text-primary-700">返回會員專區</Link></Boundary>;
  }

  const firstWeekday = state.calendarDays[0] ? weekday(state.calendarDays[0].date) : 0;
  const selectedDay = state.calendarDays.find((day) => day.date === state.selectedDate);
  const [selectedYear, selectedMonth] = state.selectedDate.split("-").map(Number);
  const chooseDate = (date: string) => {
    setExpandedBookingId(null);
    startTransition(() => { void load(date); });
  };
  return <main className="mx-auto min-h-screen max-w-md bg-[#f8f5ee] px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-earth-900">
    <header><p className="text-xs font-semibold tracking-[0.12em] text-primary-700">{storeName}</p><div className="mt-2 flex items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">我的工作</h1><p className="mt-1 text-sm text-earth-500">{state.staffName}</p></div><Link href={`/s/${storeSlug}/book`} onClick={() => localStorage.setItem(`spa-member-mode:${storeSlug}`, "member")} className="rounded-full border border-earth-300 bg-white px-4 py-2 text-sm font-medium">會員專區</Link></div></header>
    <section aria-label="工作月曆" className="mt-4 rounded-2xl bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2 px-1">
        <button aria-label="上個月" disabled={pending} onClick={() => chooseDate(monthTarget(state.selectedDate, -1))} className="flex size-9 items-center justify-center rounded-xl border border-earth-200 text-xl">‹</button>
        <div className="flex items-center gap-2"><h2 className="text-base font-bold">{selectedYear} 年 {selectedMonth} 月</h2><button disabled={pending || state.selectedDate === today} onClick={() => chooseDate(today)} className="rounded-full px-2 py-1 text-xs font-medium text-primary-700 disabled:text-earth-300">回到今天</button></div>
        <button aria-label="下個月" disabled={pending} onClick={() => chooseDate(monthTarget(state.selectedDate, 1))} className="flex size-9 items-center justify-center rounded-xl border border-earth-200 text-xl">›</button>
      </div>
      <div className="mt-1 grid grid-cols-7 text-center text-xs font-medium text-earth-400">{["日","一","二","三","四","五","六"].map((label) => <span key={label} className="py-1.5">{label}</span>)}</div>
      <div className="grid grid-cols-7 gap-1">{Array.from({ length: firstWeekday }, (_, index) => <span aria-hidden="true" key={`blank-${index}`} />)}{state.calendarDays.map((day) => {
        const selected = day.date === state.selectedDate;
        const isToday = day.date === today;
        return <button key={day.date} aria-label={`${day.date}${day.isLeave ? " 休假日" : ""}${day.bookingCount ? ` ${day.bookingCount} 筆預約` : ""}`} aria-pressed={selected} disabled={pending} onClick={() => chooseDate(day.date)} className={`relative flex min-h-10 flex-col items-center justify-center rounded-xl border text-sm transition-colors ${selected ? "border-primary-800 bg-primary-800 font-semibold text-white" : isToday ? "border-2 border-primary-600 bg-white text-earth-900" : day.isLeave ? "border-transparent bg-earth-100 text-earth-400" : "border-transparent bg-white text-earth-800"}`}>
          <span>{Number(day.date.slice(-2))}</span>
          <span aria-hidden="true" className={`mt-0.5 size-1.5 rounded-full ${day.bookingCount ? selected ? "bg-white" : "bg-blue-500" : "bg-transparent"}`} />
        </button>;
      })}</div>
      <div className="mt-2 flex items-center justify-center gap-4 border-t border-earth-100 pt-2 text-xs text-earth-500"><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-blue-500" />有預約</span><span className="rounded bg-earth-100 px-2 py-0.5">休假日</span></div>
    </section>
    <section className="mt-5"><div><p className="text-sm font-medium text-primary-700">{state.selectedDate === today ? "今日工作" : "當日工作"}{selectedDay?.isLeave ? "・休假日" : ""}</p><div className="mt-1 flex items-baseline justify-between gap-3"><h2 className="text-xl font-bold">{state.selectedDate.replaceAll("-", " / ")}</h2><span className="text-sm text-earth-500">{state.rows.length} 筆預約</span></div></div>
      <div className="mt-4 space-y-3">{state.rows.length ? state.rows.map((row) => {
        const expanded = expandedBookingId === row.id;
        return <article key={row.id} className="overflow-hidden rounded-2xl bg-white shadow-[0_6px_20px_rgba(74,66,53,0.07)]"><button type="button" aria-expanded={expanded} onClick={() => setExpandedBookingId(expanded ? null : row.id)} className="w-full p-4 text-left"><div className="flex items-center gap-2"><strong className="shrink-0 tabular-nums">{row.startTime}–{row.endTime}</strong><h3 className="min-w-0 flex-1 truncate font-semibold">{row.customerName}</h3><span className="shrink-0 rounded-full bg-earth-100 px-2.5 py-1 text-xs">{statusLabel[row.status] ?? row.status}</span></div><div className="mt-2 flex items-center gap-2 text-sm text-earth-600"><span className="min-w-0 flex-1 truncate">{row.serviceName}</span><span className="shrink-0 text-earth-400">{row.locationName}</span>{row.note && <span aria-label="有備註" title="有備註" className="shrink-0 rounded-full bg-[#fff4d8] px-2 py-0.5 text-xs text-[#856426]">有備註</span>}<span aria-hidden="true" className="shrink-0 text-earth-400">{expanded ? "⌃" : "⌄"}</span></div></button>{expanded && <div className="border-t border-earth-100 px-4 py-4 text-sm text-earth-600"><h4 className="font-semibold text-earth-800">服務細節</h4><ul className="mt-2 space-y-2">{row.items.map((item, index) => <li key={`${row.id}-${index}`} className="flex justify-between gap-3"><span>{item.name}{item.variant ? `・${item.variant}` : ""}</span><span className="shrink-0 text-earth-400">{item.serviceMinutes} 分鐘{item.bufferMinutes ? `＋整理 ${item.bufferMinutes} 分` : ""}</span></li>)}</ul>{row.note && <div className="mt-4 rounded-xl bg-earth-50 p-3"><p className="text-xs font-medium text-earth-400">預約備註</p><p className="mt-1 whitespace-pre-wrap break-words text-earth-700">{row.note}</p></div>}</div>}</article>;
      }) : <div className="rounded-2xl border border-dashed border-earth-300 bg-white/70 px-5 py-10 text-center"><p className="font-medium">當日無預約</p>{selectedDay?.isLeave ? <p className="mt-2 text-sm text-earth-500">休假日</p> : <p className="mt-2 text-sm text-earth-500">空檔不代表已開放接單，請依店內班表為準。</p>}</div>}</div>
    </section>
  </main>;
}

function Boundary({ title, children, retry }: { title: string; children?: React.ReactNode; retry?: boolean }) {
  return <main className="mx-auto max-w-md px-5 py-16 text-center"><h1 className="text-xl font-bold text-earth-900">{title}</h1>{children}{retry && <button className="mt-5 rounded-xl border border-earth-300 px-5 py-3" onClick={() => location.reload()}>重新整理</button>}</main>;
}
