"use client";

import { useRouter } from "next/navigation";
import { useStoreSlugRequired } from "@/lib/store-context";

interface Props {
  selectedDate: string; // "YYYY-MM-DD"
}

export function MonthCalendar({ selectedDate }: Props) {
  const router = useRouter();
  const storeSlug = useStoreSlugRequired();
  const prefix = `/s/${storeSlug}`;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const selected = new Date(selectedDate + "T00:00:00");
  const year = selected.getFullYear();
  const month = selected.getMonth();

  // 該月第一天與最後一天
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay(); // 0=Sun

  // 上個月、下個月
  const prevMonth = new Date(year, month - 1, 1);
  const nextMonth = new Date(year, month + 1, 1);

  // 限制：只能選今天起 30 天內
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 30);

  const days: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);

  const weekLabels = ["日", "一", "二", "三", "四", "五", "六"];

  const handleSelect = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    router.push(`${prefix}/book/new?date=${dateStr}`);
  };

  const handlePrevMonth = () => {
    const d = new Date(prevMonth);
    router.push(`${prefix}/book/new?date=${d.toISOString().slice(0, 10)}`);
  };

  const handleNextMonth = () => {
    const d = new Date(nextMonth);
    router.push(`${prefix}/book/new?date=${d.toISOString().slice(0, 10)}`);
  };

  const monthLabel = `${year} 年 ${month + 1} 月`;

  return (
    <div className="mb-4 rounded-2xl border border-earth-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={handlePrevMonth}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-lg text-earth-800 hover:bg-earth-100"
          aria-label="上個月"
        >
          &lt;
        </button>
        <span className="text-lg font-bold text-earth-900">{monthLabel}</span>
        <button
          onClick={handleNextMonth}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-lg text-earth-800 hover:bg-earth-100"
          aria-label="下個月"
        >
          &gt;
        </button>
      </div>

      {/* Week labels */}
      <div className="grid grid-cols-7 text-center text-sm font-semibold text-earth-700">
        {weekLabels.map((w) => (
          <div key={w} className="py-2">{w}</div>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7 text-center">
        {days.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} />;

          const dateObj = new Date(year, month, day);
          dateObj.setHours(0, 0, 0, 0);
          const isPast = dateObj < today;
          const isBeyond = dateObj > maxDate;
          const disabled = isPast || isBeyond;
          const isSelected =
            day === selected.getDate() &&
            month === selected.getMonth() &&
            year === selected.getFullYear();
          const isToday =
            day === today.getDate() &&
            month === today.getMonth() &&
            year === today.getFullYear();

          return (
            <button
              key={day}
              disabled={disabled}
              onClick={() => handleSelect(day)}
              className={`mx-auto my-1 flex h-11 w-11 items-center justify-center rounded-full text-base transition ${
                isSelected
                  ? "bg-primary-600 font-bold text-white"
                  : disabled
                    ? "text-earth-400"
                    : isToday
                      ? "font-bold text-primary-700 hover:bg-primary-50"
                      : "text-earth-800 hover:bg-earth-100"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
