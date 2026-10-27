"use client";
import { useId, useState } from "react";
import { toLocalDateStr } from "@/lib/date-utils";
import { courseMonthDays } from "@/lib/course-calendar";
import styles from "./public-trial.module.css";

/** Only sports supplies known availability. Beauty dates are a selection,
 * never labelled available before its server has checked the whole party. */
export function PublicBookingCalendar({ value, onChange, availableDates, disabled = false, id, describedBy, invalid }: {
  value: string; onChange: (date: string) => void; availableDates?: ReadonlyMap<string, number>; disabled?: boolean;
  id?: string; describedBy?: string; invalid?: boolean;
}) {
  const today = toLocalDateStr(), generatedId = useId();
  const first = availableDates ? [...availableDates.keys()].filter(d => d >= today).sort()[0] : undefined;
  const [month, setMonth] = useState((value || first || today).slice(0, 7));
  const { offset, dates } = courseMonthDays(month);
  const lastAvailable = availableDates ? [...availableDates.keys()].sort().at(-1)?.slice(0, 7) : undefined;
  function shift(delta: number) {
    const [year, number] = month.split("-").map(Number), date = new Date(Date.UTC(year, number - 1 + delta, 1));
    setMonth(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return <div id={id} className={styles.calendar} role="group" aria-label="選擇日期" data-invalid={invalid || undefined} aria-describedby={describedBy} tabIndex={-1}>
    <div className={styles.calendarTop}><button type="button" aria-label="上個月" onClick={() => shift(-1)} disabled={disabled || month <= today.slice(0, 7)}>‹</button><strong id={generatedId} aria-live="polite">{month.replace("-", " 年 ")} 月</strong><button type="button" aria-label="下個月" onClick={() => shift(1)} disabled={disabled || !!lastAvailable && month >= lastAvailable}>›</button></div>
    <div className={styles.calendarWeek} aria-hidden="true">{[..."日一二三四五六"].map(d => <span key={d}>{d}</span>)}</div>
    <div className={styles.calendarDays} aria-labelledby={generatedId}>
      {Array.from({ length: offset }, (_, i) => <span key={`blank-${i}`} />)}
      {dates.map(date => {
        const count = availableDates?.get(date) ?? 0, unavailable = date < today || !!availableDates && !count;
        return <button type="button" key={date} aria-label={`${date}${availableDates ? count ? ` ${count} 堂體驗課` : " 未開放" : " 選擇後查詢時段"}`} aria-pressed={value === date}
          disabled={disabled || unavailable} onClick={() => onChange(date)} data-today={date === today || undefined}>
          <span>{Number(date.slice(-2))}</span><small>{availableDates ? count ? `${count} 堂` : "—" : date === today ? "今天" : ""}</small>
        </button>;
      })}
    </div>
    <p className={styles.calendarNote}>{availableDates ? "僅顯示目前有公開體驗課的日期；名額以送出時確認為準。" : "選擇日期後查詢時段，實際可約時間依服務與技師安排確認。"}</p>
  </div>;
}
