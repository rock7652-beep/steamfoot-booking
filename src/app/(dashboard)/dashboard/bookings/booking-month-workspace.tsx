"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { readBookingMonth } from "@/lib/booking-month-read";
import { BookingsManager, type BookingsManagerProps } from "./bookings-manager";
import { BookingMonthContext } from "./booking-month-context";
import { createBookingMonthCache } from "./booking-month-cache";

type Snapshot = Pick<BookingsManagerProps, "monthData" | "monthSchedule" | "customerLabels">;
const keyOf = (year: number, month: number) => `${year}-${month}`;
function adjacent(year: number, month: number, delta: number) {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}
const valid = (year: number, month: number) => Number.isInteger(year) && year >= 2000 && year <= 2100 && Number.isInteger(month) && month >= 1 && month <= 12;

/** Scope is keyed by the server's authorized account/store/read-only boundary. */
export function BookingMonthWorkspace(props: BookingsManagerProps) {
  const [cache] = useState(() => {
    const result = createBookingMonthCache<Snapshot>();
    result.put(keyOf(props.year, props.month), { monthData: props.monthData, monthSchedule: props.monthSchedule, customerLabels:props.customerLabels });
    return result;
  });
  const [view, setView] = useState<{ year: number; month: number; snapshot: Snapshot | null; initialBookingId?: string | null }>({ year: props.year, month: props.month, initialBookingId: props.initialBookingId, snapshot: { monthData: props.monthData, monthSchedule: props.monthSchedule, customerLabels:props.customerLabels } });
  const [error, setError] = useState(false);
  const busy = useRef(false);
  const sequence = useRef(0);
  const latest = useRef(view);
  useLayoutEffect(() => { latest.current = view; }, [view]);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const load = useCallback((year: number, month: number) => cache.load(keyOf(year, month), () => readBookingMonth({ year, month, storeId: props.storeId })), [cache, props.storeId]);

  const navigate = useCallback((year: number, month: number, history = true) => {
    if (!valid(year, month) || busy.current) return;
    const request = ++sequence.current;
    const epoch = cache.generation;
    const snapshot = cache.get(keyOf(year, month)) ?? null;
    setError(false);
    setView({ year, month, snapshot });
    if (history) {
      const url = new URL(window.location.href);
      url.searchParams.set("year", String(year));
      url.searchParams.set("month", String(month));
      url.searchParams.delete("date");
      url.searchParams.delete("bookingId");
      window.history.pushState(null, "", url.pathname + url.search);
    }
    void load(year, month).then(fresh => {
      if (mounted.current && request === sequence.current && epoch === cache.generation && !busy.current) setView({ year, month, snapshot: fresh });
    }).catch(() => {
      if (mounted.current && request === sequence.current && epoch === cache.generation) setError(true);
    });
  }, [cache, load]);

  const context = useMemo(() => ({
    navigate,
    invalidate: () => cache.invalidate(),
    busy: (value: boolean) => { busy.current = value; },
  }), [cache, navigate]);

  // Native history changes only the month selection, not the server page/layout.
  useEffect(() => {
    const pop = () => {
      if (busy.current) {
        const current = latest.current;
        window.history.pushState(null, "", `?year=${current.year}&month=${current.month}`);
        return;
      }
      const params = new URLSearchParams(window.location.search);
      if (params.has("bookingId")) { window.location.reload(); return; }
      const date = params.get("date");
      const year = Number(params.get("year") ?? date?.slice(0, 4) ?? props.year);
      const month = Number(params.get("month") ?? date?.slice(5, 7) ?? props.month);
      navigate(year, month, false);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [navigate, props.year, props.month]);

  const hasSnapshot = view.snapshot !== null;
  // Current month renders before any speculative request; at most two sequential
  // neighbors. Never launch the next request while editing, hidden or offline.
  useEffect(() => {
    if (!hasSnapshot) return;
    let canceled = false;
    let timer: ReturnType<typeof setTimeout>;
    const targets = [-1, 1].map(delta => adjacent(view.year, view.month, delta));
    const next = async () => {
      if (canceled || !targets.length) return;
      if (busy.current || document.hidden || !navigator.onLine || document.activeElement?.matches("input, textarea, select, [contenteditable='true']")) {
        timer = setTimeout(() => { void next(); }, 1500);
        return;
      }
      const target = targets.shift()!;
      if (valid(target.year, target.month) && !cache.get(keyOf(target.year, target.month))) {
        try { await load(target.year, target.month); } catch { /* Navigation has its own visible retry. */ }
      }
      if (!canceled && targets.length) timer = setTimeout(() => { void next(); }, 500);
    };
    timer = setTimeout(() => { void next(); }, 1500);
    return () => { canceled = true; clearTimeout(timer); };
  }, [view.year, view.month, hasSnapshot, cache, load]);

  return <BookingMonthContext.Provider value={context}>
    {error && <div role="alert" className="mb-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm">
      {view.snapshot ? "最新預約暫時無法同步，目前保留上次資料。" : "預約載入失敗，尚無法判斷本月預約。"}
      <button className="ml-3 underline" onClick={() => navigate(view.year, view.month, false)}>重試</button>
    </div>}
    {view.snapshot ? <BookingsManager {...props} key={keyOf(view.year, view.month)} year={view.year} month={view.month}
      monthData={view.snapshot.monthData} monthSchedule={view.snapshot.monthSchedule} customerLabels={view.snapshot.customerLabels}
      initialBookingId={view.initialBookingId ?? null} />
      : <section aria-busy={!error} className="rounded-lg border border-earth-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <button aria-label="上個月" onClick={() => { const target = adjacent(view.year, view.month, -1); navigate(target.year, target.month); }}>‹</button>
          <h2 className="text-lg font-semibold">{view.year} 年 {view.month} 月</h2>
          <button aria-label="下個月" onClick={() => { const target = adjacent(view.year, view.month, 1); navigate(target.year, target.month); }}>›</button>
        </div>
        <p role="status" className="py-3 text-sm text-earth-600">{error ? "請重試載入預約" : "預約載入中…"}</p>
        <div aria-hidden="true" className="grid grid-cols-7 gap-2">{Array.from({ length: 35 }, (_, i) => <div key={i} className="h-20 animate-pulse rounded bg-earth-50" />)}</div>
      </section>}
  </BookingMonthContext.Provider>;
}
