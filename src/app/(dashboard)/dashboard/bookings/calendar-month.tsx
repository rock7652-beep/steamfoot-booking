"use client";

import Link from "next/link";

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

interface MonthSummaryDay {
  date: string;
  totalBookingCount: number;
  staffBookings: Array<{ staffName: string; colorCode: string; count: number }>;
}

interface CalendarMonthProps {
  year: number;
  month: number;
  monthData: MonthSummaryDay[];
  /** Base path for day view links. Defaults to "" (relative to current page). */
  basePath?: string;
}

export function CalendarMonth({ year, month, monthData, basePath = "" }: CalendarMonthProps) {
  const monthLabel = `${year}年${month}月`;
  const firstDayOfMonth = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  // Calculate prev/next month URLs
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  const todayStr = new Date().toISOString().slice(0, 10);

  const getData = (day: number) => {
    const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return monthData.find((d) => d.date === dateKey);
  };

  // Collect all unique staff across the month for the legend
  const staffColorMap = new Map<string, string>();
  for (const day of monthData) {
    for (const s of day.staffBookings) {
      if (!staffColorMap.has(s.staffName)) {
        staffColorMap.set(s.staffName, s.colorCode);
      }
    }
  }

  return (
    <div className="space-y-3">
      {/* Month Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href={`${basePath}?year=${prevYear}&month=${prevMonth}`}
          className="rounded-lg border border-earth-300 px-3 py-2 text-sm hover:bg-earth-50 active:bg-earth-100"
        >
          ←
        </Link>
        <span className="text-base font-bold text-earth-900">{monthLabel}</span>
        <Link
          href={`${basePath}?year=${nextYear}&month=${nextMonth}`}
          className="rounded-lg border border-earth-300 px-3 py-2 text-sm hover:bg-earth-50 active:bg-earth-100"
        >
          →
        </Link>
      </div>

      {/* Today shortcut */}
      <div className="flex justify-center">
        <Link
          href={basePath || "/dashboard/bookings"}
          className="rounded-full bg-primary-50 px-4 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100"
        >
          回到今天
        </Link>
      </div>

      {/* Staff Color Legend */}
      {staffColorMap.size > 0 && (
        <div className="flex flex-wrap gap-3 rounded-lg bg-earth-50 p-2.5">
          {Array.from(staffColorMap.entries()).map(([name, color]) => (
            <div key={name} className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-xs text-earth-600">{name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Calendar Grid */}
      <div className="overflow-hidden rounded-xl border border-earth-200 bg-white shadow-sm">
        {/* Weekday Headers */}
        <div className="grid grid-cols-7 border-b border-earth-100 bg-earth-50">
          {WEEKDAY_LABELS.map((label, i) => (
            <div
              key={label}
              className={`py-2 text-center text-xs font-semibold ${
                i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-earth-500"
              }`}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Day Cells */}
        <div className="grid grid-cols-7">
          {/* Empty cells */}
          {Array.from({ length: firstDayOfMonth }).map((_, i) => (
            <div key={`empty-${i}`} className="border-b border-r border-earth-100 bg-earth-50 p-1.5 min-h-[3.5rem]" />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayData = getData(day);
            const isToday = todayStr === dayKey;
            const hasBookings = dayData && dayData.totalBookingCount > 0;

            return (
              <Link
                key={day}
                href={basePath ? `${basePath}?view=day&date=${dayKey}` : `?view=day&date=${dayKey}`}
                className={`relative border-b border-r border-earth-100 p-1.5 min-h-[3.5rem] transition-colors active:bg-primary-50 ${
                  isToday ? "bg-primary-50/60" : "hover:bg-earth-50"
                }`}
              >
                {/* Day number */}
                <div
                  className={`text-xs font-medium ${
                    isToday
                      ? "flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-white"
                      : "text-earth-700"
                  }`}
                >
                  {day}
                </div>

                {/* Booking info */}
                {hasBookings && (
                  <div className="mt-0.5 space-y-0.5">
                    <div className="text-[10px] font-semibold text-primary-600">
                      {dayData.totalBookingCount}筆
                    </div>
                    <div className="flex flex-wrap gap-0.5">
                      {dayData.staffBookings.slice(0, 4).map((staff) => (
                        <div
                          key={staff.staffName}
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: staff.colorCode }}
                          title={`${staff.staffName} (${staff.count})`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
