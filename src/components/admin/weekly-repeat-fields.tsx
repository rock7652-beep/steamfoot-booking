"use client";
import { useState, type ReactNode } from "react";
import { courseWeeklyDates } from "@/lib/course-schedule-form";
import { parseLocalDate, parseTaipeiDateTime } from "@/lib/date-utils";

const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
export function WeeklyRepeatFields({ date, repeatControl, disabled = false, onChange }: {
  date: string;
  repeatControl?: ReactNode;
  disabled?: boolean;
  onChange: (weeks: string, extraWeekdays: number[]) => void;
}) {
  const [weeks, setWeeks] = useState("1");
  const [extraDays, setExtraDays] = useState<number[]>([]);
  const startDay = parseTaipeiDateTime(date, "00:00") ? parseLocalDate(date).getDay() : null;
  let dates: string[] = [];
  let error = "";
  try { dates = courseWeeklyDates(date, Number(weeks), extraDays); }
  catch (cause) { error = cause instanceof Error ? cause.message : "請確認週數"; }
  const selectedDays = weekdays.filter((_, day) => day === startDay || extraDays.includes(day));
  return <div className="col-span-full space-y-2">
    <div className="flex flex-wrap items-end gap-3">
      {repeatControl}
      <label className="w-28 shrink-0 text-sm text-earth-700">重複幾週
        <input name="repeatWeeks" aria-label="重複幾週" type="number" min={1} max={53} step={1} required disabled={disabled}
          className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 py-1.5 text-base"
          value={weeks} onChange={event => { setWeeks(event.target.value); onChange(event.target.value, extraDays); }} />
      </label>
    </div>
    <div aria-live="polite" aria-label="重複排課日期" className="rounded-lg bg-primary-50/50 px-3 py-2 text-sm text-earth-700">
      {error ? <p role="alert">{error}</p> : <><p className="font-medium text-primary-900">每週{selectedDays.join("、")}・共 {dates.length} 堂 <span className="font-normal text-xs text-earth-500">（含目前這一堂）</span></p>
      <div className="mt-1 flex max-h-24 flex-wrap gap-x-3 gap-y-1 overflow-y-auto">{dates.map(day => <span key={day} title={day}>{day.slice(5).replace("-", "/")}</span>)}</div></>}
    </div>
    <details name="course-workspace-details"><summary className="inline-flex min-h-11 cursor-pointer items-center text-xs text-earth-600">其他上課日</summary>
      <div className="flex flex-wrap gap-1.5" aria-label="每週上課日">{weekdays.map((label, day) => {
        const selected = day === startDay || extraDays.includes(day);
        return <button key={day} type="button" aria-label={`每週${label}`} aria-pressed={selected} disabled={disabled || day === startDay}
          className={`min-h-11 min-w-11 rounded-lg border px-3 text-sm ${selected ? "border-primary-300 bg-primary-50 text-primary-900" : "border-earth-200 bg-white text-earth-600"}`}
          onClick={() => { const next = extraDays.includes(day) ? extraDays.filter(value => value !== day) : [...extraDays, day]; setExtraDays(next); onChange(weeks, next); }}>{label}</button>;
      })}</div>
    </details>
    {extraDays.map(day => <input key={day} type="hidden" name="weekday" value={day} />)}
  </div>;
}
