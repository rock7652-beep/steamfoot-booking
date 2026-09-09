"use client";

import { useEffect, useState } from "react";
import { fetchCustomerBookedDates, type CustomerBookedDate } from "@/server/actions/customer-booked-dates";

/** LIFF-style booked-date dots, isolated from LIFF capacity and SPA rules. */
export function SteamfootBookingCalendar({ days, value, onChange, customerId, disabled = false, refreshKey = 0 }: {
  days: string[];
  value: string;
  onChange: (date: string) => void;
  customerId?: string | null;
  disabled?: boolean;
  refreshKey?: number;
}) {
  const [month, setMonth] = useState((value || days[0] || "").slice(0, 7));
  const [result, setResult] = useState<{ key: string; rows: CustomerBookedDate[]; failed: boolean } | null>(null);
  const first = days[0] ?? "";
  const last = days[days.length - 1] ?? "";
  const key = `${customerId ?? ""}:${first}:${last}:${refreshKey}`;
  const rows = result?.key === key ? result.rows : [];
  const loading = !!customerId && result?.key !== key;

  useEffect(() => {
    if (!customerId || !first || !last) return;
    let cancelled = false;
    fetchCustomerBookedDates(customerId, first, last).then(
      (rows) => { if (!cancelled) setResult({ key, rows, failed: false }); },
      () => { if (!cancelled) setResult({ key, rows: [], failed: true }); },
    );
    return () => { cancelled = true; };
  }, [customerId, first, last, key]);

  const months = [...new Set(days.map((day) => day.slice(0, 7)))];
  const visibleMonth = months.includes(month) ? month : months[0];
  if (!visibleMonth) return null;
  const [year, monthNumber] = visibleMonth.split("-").map(Number);
  const offset = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const allowed = new Set(days);
  const booked = new Set(rows.map((row) => row.date));
  const selectedBookings = rows.filter((row) => row.date === value);
  const monthIndex = months.indexOf(visibleMonth);

  return (
    <div className="mt-1.5 min-w-0 rounded-lg border border-earth-200 bg-white p-3">
      <input type="hidden" name="bookingDate" value={value} />
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label="上個月" disabled={disabled || monthIndex === 0}
          onClick={() => setMonth(months[monthIndex - 1])} className="h-10 w-10 rounded text-earth-700 disabled:opacity-30">‹</button>
        <span className="text-sm font-medium text-earth-800">{year} 年 {monthNumber} 月</span>
        <button type="button" aria-label="下個月" disabled={disabled || monthIndex === months.length - 1}
          onClick={() => setMonth(months[monthIndex + 1])} className="h-10 w-10 rounded text-earth-700 disabled:opacity-30">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {["日", "一", "二", "三", "四", "五", "六"].map((day) => <span key={day} className="pb-1 text-xs text-earth-500">{day}</span>)}
        {Array.from({ length: offset }, (_, i) => <span key={`blank-${i}`} />)}
        {Array.from({ length: count }, (_, i) => {
          const date = `${visibleMonth}-${String(i + 1).padStart(2, "0")}`;
          const selected = value === date;
          const hasBooking = booked.has(date);
          return <button key={date} type="button" disabled={disabled || !allowed.has(date)}
            aria-label={`${date}${hasBooking ? "，這位顧客已有預約" : ""}`} aria-pressed={selected}
            onClick={() => onChange(date)}
            className={`flex min-h-11 min-w-0 flex-col items-center justify-center rounded-md text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-30 ${selected ? "bg-earth-800 text-white" : "text-earth-800 hover:bg-earth-50"}`}>
            {i + 1}<span aria-hidden="true" className={`mt-1 h-1.5 w-1.5 rounded-full ${hasBooking ? selected ? "bg-blue-300" : "bg-blue-500" : "bg-transparent"}`} />
          </button>;
        })}
      </div>
      <div className="mt-2 text-xs text-earth-600" aria-live="polite">
        {!customerId ? "選擇顧客後，會標示已預約日期。" : loading ? "正在讀取已預約日期…" : result?.failed ? "暫時無法讀取已預約提示，仍可選擇日期。" : (
          <><p className="flex items-center gap-1.5"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-blue-500" />這位顧客已有預約</p>
            {selectedBookings.length > 0 && <p className="mt-1 text-blue-700">當日已預約：{selectedBookings.map((row) => `${row.time}（${row.people} 人）`).join("、")}；仍可追加預約。</p>}</>
        )}
      </div>
    </div>
  );
}
