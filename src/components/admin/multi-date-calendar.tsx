"use client";

import { useState } from "react";
import { addTaiwanDuration, parseLocalDate } from "@/lib/date-utils";

export function MultiDateCalendar({ baseDate, initialMonth, dates, onChange, disabled = false }: {
  baseDate: string;
  initialMonth: string;
  dates: string[];
  onChange: (dates: string[]) => void;
  disabled?: boolean;
}) {
  const [month, setMonth] = useState(() => (baseDate || initialMonth).slice(0, 7));
  const first = `${month}-01`;
  const next = addTaiwanDuration(first, 1, "MONTH");
  const count = Number(addTaiwanDuration(next, -1, "DAY").slice(8));
  const offset = parseLocalDate(first).getDay();
  const selected = new Set([baseDate, ...dates].filter(Boolean));
  return <div className="mx-auto grid w-full max-w-xl gap-3 min-[640px]:grid-cols-[minmax(0,1fr)_144px]">
  <fieldset className="min-w-0 rounded-lg border border-earth-200 bg-white p-2" disabled={disabled}>
    <legend className="px-1 text-sm">點選日期 · 已選 {selected.size} 天</legend>
    <div className="flex items-center justify-between">
      <button type="button" aria-label="上個月" className="min-h-11 min-w-11 rounded hover:bg-primary-50" onClick={() => setMonth(addTaiwanDuration(first, -1, "MONTH").slice(0, 7))}>‹</button>
      <strong className="text-sm" aria-live="polite">{month.replace("-", " 年 ")} 月</strong>
      <button type="button" aria-label="下個月" className="min-h-11 min-w-11 rounded hover:bg-primary-50" onClick={() => setMonth(next.slice(0, 7))}>›</button>
    </div>
    <div className="grid grid-cols-7 text-center text-sm">
      {["日", "一", "二", "三", "四", "五", "六"].map(day => <span key={day} className="py-1 text-xs text-earth-500">{day}</span>)}
      {Array.from({ length: offset }, (_, index) => <span key={`blank-${index}`} />)}
      {Array.from({ length: count }, (_, index) => {
        const date = `${month}-${String(index + 1).padStart(2, "0")}`;
        const active = selected.has(date);
        return <button key={date} type="button" aria-label={date} aria-pressed={active}
          disabled={!baseDate || date === baseDate || (!active && dates.length >= 52)}
          title={date === baseDate ? "起始日期" : undefined}
          className={`m-0.5 min-h-11 rounded-md tabular-nums ${active ? "bg-primary-700 font-semibold text-white" : "text-earth-800 hover:bg-primary-50 disabled:text-earth-300"}`}
          onClick={() => onChange(active ? dates.filter(value => value !== date) : [...dates, date].sort())}>{index + 1}</button>;
      })}
    </div>
    <div className="flex min-h-9 items-center justify-between gap-2 text-xs text-earth-500">
      <span>{baseDate ? "起始日保留；再點取消，可跨月選取" : "請先選擇起始日期"}</span>
      {!!dates.length && <button type="button" className="min-h-11 shrink-0 px-2 text-primary-800" onClick={() => onChange([])}>清除其他日期</button>}
    </div>
  </fieldset>
  <div aria-label="已選排課日期" className="min-w-0 rounded-lg bg-primary-50/50 px-3 py-2 text-sm text-earth-700">
    <p className="mb-2 font-medium text-primary-900">已選 {selected.size} 天</p>
    <div className="flex max-h-28 flex-wrap gap-x-3 gap-y-2 overflow-y-auto min-[640px]:max-h-80 min-[640px]:flex-col">
      {[...selected].sort().map(date => <span key={date} title={date} className="tabular-nums">{date.slice(5).replace("-", "/")}{date === baseDate && <span className="ml-1 text-xs text-earth-500">起始日</span>}</span>)}
    </div>
  </div>
  </div>;
}
