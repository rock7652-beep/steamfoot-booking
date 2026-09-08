"use client";

import { useMemo, useState } from "react";
import { formatDateWithWeekdayZh, parseLocalDate, toDateInputValue } from "@/lib/date-utils";
import type { SpaDemoBooking, SpaDemoProvider } from "@/lib/spa-demo-store";

export type SpaStaffBooking = Pick<
  SpaDemoBooking,
  | "id"
  | "date"
  | "time"
  | "customer"
  | "service"
  | "providerId"
  | "durationMinutes"
  | "bufferMinutes"
  | "status"
>;

function addDays(dateString: string, days: number) {
  const date = parseLocalDate(dateString);
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

function addMinutes(time: string, minutes: number) {
  const [hour, minute] = time.split(":").map(Number);
  const total = hour * 60 + minute + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function SpaStaffSchedulePreview({
  provider,
  allBookings,
  today,
}: {
  provider: SpaDemoProvider;
  allBookings: readonly SpaStaffBooking[];
  today: string;
}) {
  const [selectedDate, setSelectedDate] = useState(today);
  const bookings = useMemo(
    () => allBookings
      .filter((booking) => booking.providerId === provider.id && booking.date === selectedDate)
      .sort((left, right) => left.time.localeCompare(right.time)),
    [allBookings, provider.id, selectedDate],
  );
  const isToday = selectedDate === today;

  return (
    <>
      <header className="rounded-2xl border border-earth-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold tracking-[0.12em] text-primary-700">SPA 芳療師行程</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-earth-900">{provider.badge}號 {provider.name}</h1>
            <p className="mt-1 text-sm text-earth-500">{provider.specialties}</p>
          </div>
          <span className="rounded-full bg-primary-100 px-3 py-1 text-sm font-medium text-primary-700">
            {isToday ? "今日 " : ""}{bookings.length} 筆
          </span>
        </div>
      </header>

      <section className="rounded-2xl border border-earth-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-primary-700">{isToday ? "今日工作" : "當日工作"}</p>
            <h2 className="mt-1 text-xl font-bold text-earth-900">{formatDateWithWeekdayZh(selectedDate)}</h2>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-[auto_1fr_auto] items-center gap-2" aria-label="切換行程日期">
          <button
            type="button"
            onClick={() => setSelectedDate((date) => addDays(date, -1))}
            className="rounded-xl border border-earth-200 bg-white px-3 py-3 text-sm font-medium text-earth-700"
          >
            前一天
          </button>
          <input
            type="date"
            aria-label="行程日期"
            value={selectedDate}
            onChange={(event) => event.target.value && setSelectedDate(event.target.value)}
            className="min-w-0 rounded-xl border border-earth-200 bg-earth-50 px-3 py-3 text-center text-sm font-semibold text-earth-800"
          />
          <button
            type="button"
            onClick={() => setSelectedDate((date) => addDays(date, 1))}
            className="rounded-xl border border-earth-200 bg-white px-3 py-3 text-sm font-medium text-earth-700"
          >
            後一天
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {bookings.length ? bookings.map((booking) => (
            <article key={booking.id} className="rounded-xl border border-primary-200 bg-primary-50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold text-earth-900">
                    {booking.time}–{addMinutes(booking.time, booking.durationMinutes)}
                  </p>
                  <p className="mt-1 font-medium text-earth-800">{booking.customer}</p>
                  <p className="mt-1 text-sm text-earth-600">{booking.service}・{booking.durationMinutes} 分鐘</p>
                  <p className="mt-2 text-xs text-earth-500">服務後保留 {booking.bufferMinutes} 分鐘整理</p>
                </div>
                <span className="shrink-0 rounded-full bg-white px-2 py-1 text-xs text-primary-700">{booking.status}</span>
              </div>
            </article>
          )) : (
            <p className="rounded-xl bg-earth-50 px-4 py-5 text-center text-sm text-earth-500">當天尚未安排顧客</p>
          )}
        </div>
      </section>
    </>
  );
}
