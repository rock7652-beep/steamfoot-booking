"use client";

import { useEffect, useRef, useState } from "react";
import { DashboardLink as Link } from "@/components/dashboard-link";

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

interface BookingEntry {
  id: string;
  slotTime: string;
  customerName: string;
  bookingStatus: string;
  isMakeup: boolean;
  people: number;
  staffId: string | null;
  staffName: string | null;
  staffColor: string | null;
}

// Keep bookings optional here too — getMonthBookingSummary on main doesn't return it yet.
interface MonthSummaryDay {
  date: string;
  totalBookingCount: number;
  totalPeople: number;
  staffBookings: Array<{ staffName: string; colorCode: string; count: number }>;
  bookings?: BookingEntry[];
}

const STATUS_STYLE: Record<
  string,
  { bg: string; border: string; textMuted?: string }
> = {
  PENDING: { bg: "bg-earth-100", border: "border-l-earth-400" },
  CONFIRMED: { bg: "bg-blue-50", border: "border-l-blue-500" },
  CHECKED_IN: { bg: "bg-amber-50", border: "border-l-amber-500" },
  COMPLETED: { bg: "bg-green-50", border: "border-l-green-500" },
  NO_SHOW: { bg: "bg-red-50", border: "border-l-red-500" },
  CANCELLED: { bg: "bg-earth-50", border: "border-l-earth-300", textMuted: "text-earth-400" },
};

interface BookingCalendarDesktopProps {
  year: number;
  month: number;
  monthData: MonthSummaryDay[];
  selectedDate: string | null;
  onDaySelect: (dateKey: string) => void;
  onBookingClick?: (bookingId: string) => void;
  basePath?: string;
  /** 指定教練名稱時：cell 內僅該教練的 strip 保留原色，其他轉灰 */
  highlightStaff?: string | null;
  /** 篩選後無符合資料的日期（cell 整體變灰） */
  dimmedDates?: Set<string>;
}

export function BookingCalendarDesktop({
  year,
  month,
  monthData,
  selectedDate,
  onDaySelect,
  onBookingClick,
  basePath = "",
  highlightStaff = null,
  dimmedDates,
}: BookingCalendarDesktopProps) {
  const firstDayOfMonth = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const prevMonthLastDay = new Date(year, month - 1, 0).getDate();

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  const monthLabel = `${year} 年 ${month} 月`;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  const byDate = new Map(monthData.map((d) => [d.date, d]));

  const totalCells = 42;
  const cells: Array<{ key: string; dayNum: number; inMonth: boolean; isoDate: string | null }> = [];

  for (let i = 0; i < firstDayOfMonth; i++) {
    const dayNum = prevMonthLastDay - firstDayOfMonth + 1 + i;
    cells.push({
      key: `prev-${dayNum}`,
      dayNum,
      inMonth: false,
      isoDate: null,
    });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ key: iso, dayNum: d, inMonth: true, isoDate: iso });
  }
  let nextDay = 1;
  while (cells.length < totalCells) {
    cells.push({
      key: `next-${nextDay}`,
      dayNum: nextDay,
      inMonth: false,
      isoDate: null,
    });
    nextDay++;
  }

  return (
    <div className="rounded-lg border border-earth-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3 pb-3">
        <h2 className="text-lg font-semibold text-earth-900">{monthLabel}</h2>
        <div className="flex items-center gap-2">
          <Link
            href={`${basePath}?year=${prevYear}&month=${prevMonth}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-earth-300 text-earth-600 hover:bg-earth-50"
            aria-label="上個月"
          >
            ‹
          </Link>
          {!isCurrentMonth && (
            <Link
              href={basePath || "/dashboard/bookings"}
              className="inline-flex h-7 items-center rounded border border-earth-300 bg-white px-3 text-xs font-semibold text-earth-700 hover:bg-earth-50"
            >
              今日
            </Link>
          )}
          <Link
            href={`${basePath}?year=${nextYear}&month=${nextMonth}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-earth-300 text-earth-600 hover:bg-earth-50"
            aria-label="下個月"
          >
            ›
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-earth-200">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={`py-1.5 text-center text-xs font-semibold ${
              i === 0
                ? "text-red-500"
                : i === 6
                  ? "text-blue-500"
                  : "text-earth-500"
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((cell) => {
          const data = cell.isoDate ? byDate.get(cell.isoDate) : null;
          const isToday = cell.isoDate === todayStr;
          const isSelected = cell.isoDate === selectedDate;
          const isDimmed = !!(cell.isoDate && dimmedDates?.has(cell.isoDate));
          const weekdayIdx = cells.indexOf(cell) % 7;

          const borderCls = `border-b border-r border-earth-100 ${
            weekdayIdx === 6 ? "border-r-0" : ""
          }`;

          const bgCls = !cell.inMonth
            ? "bg-earth-50/40"
            : isSelected
              ? "bg-primary-50 ring-2 ring-inset ring-primary-500"
              : isToday
                ? "bg-primary-50/60"
                : "bg-white hover:bg-earth-50";

          const dateNumberCls = !cell.inMonth
            ? "text-earth-300"
            : weekdayIdx === 0
              ? "text-red-500"
              : weekdayIdx === 6
                ? "text-blue-500"
                : "text-earth-700";

          const allBookings = data?.bookings ?? [];
          const visibleBookings = allBookings.slice(0, 3);
          const remainingBookings = allBookings.slice(3);

          const handleClick = () => {
            if (cell.isoDate) onDaySelect(cell.isoDate);
          };

          return (
            <div
              key={cell.key}
              className={`relative flex min-h-[96px] flex-col text-left transition-colors ${borderCls} ${bgCls} ${
                isDimmed ? "opacity-40" : ""
              }`}
            >
              <button
                type="button"
                onClick={handleClick}
                disabled={!cell.isoDate}
                className={`flex flex-1 flex-col gap-1 px-1.5 py-1.5 text-left ${
                  cell.isoDate ? "cursor-pointer" : "cursor-default"
                }`}
              >
                <div className="flex items-start justify-between">
                  <span
                    className={`inline-flex h-6 min-w-6 items-center justify-center text-sm font-semibold tabular-nums ${
                      isToday && cell.inMonth
                        ? "rounded-full bg-primary-600 px-1.5 text-white"
                        : dateNumberCls
                    }`}
                  >
                    {cell.dayNum}
                  </span>
                  {data && data.totalBookingCount > 0 && (
                    <span className="text-[10px] font-medium text-earth-400 tabular-nums">
                      {data.totalPeople}人
                    </span>
                  )}
                </div>

                {cell.inMonth && data && data.totalBookingCount > 0 && (
                  <div className="flex flex-col gap-0.5">
                    {visibleBookings.map((b) => (
                      <BookingStrip
                        key={b.id}
                        booking={b}
                        highlightStaff={highlightStaff}
                        onClick={
                          onBookingClick
                            ? (e) => {
                                e.stopPropagation();
                                onBookingClick(b.id);
                              }
                            : undefined
                        }
                      />
                    ))}
                  </div>
                )}
              </button>
              {remainingBookings.length > 0 && cell.inMonth && cell.isoDate && (
                <MoreBookingsPopover
                  dateKey={cell.isoDate}
                  remaining={remainingBookings}
                  highlightStaff={highlightStaff}
                  onBookingClick={onBookingClick}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BookingStrip({
  booking,
  highlightStaff,
  onClick,
}: {
  booking: BookingEntry;
  highlightStaff: string | null;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const dimmed = !!(highlightStaff && booking.staffName !== highlightStaff);
  const style =
    STATUS_STYLE[booking.bookingStatus] ?? STATUS_STYLE.PENDING;

  const staffAccent = booking.staffColor ?? "#CBD0DA";
  const border = dimmed ? "#E3E6EC" : staffAccent;
  const clickable = !!onClick;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`flex h-[18px] w-full items-center gap-1 truncate rounded-[3px] pr-1.5 text-left text-[11px] font-medium ${style.bg} ${
        dimmed ? "opacity-50" : ""
      } ${clickable ? "cursor-pointer hover:brightness-95" : "cursor-default"}`}
      style={{ borderLeft: `3px solid ${border}`, paddingLeft: 6 }}
      title={`${booking.slotTime} ${booking.customerName} · ${booking.staffName ?? "未指派"}`}
    >
      <span className="shrink-0 tabular-nums text-earth-500">
        {booking.slotTime}
      </span>
      <span className={`truncate ${style.textMuted ?? "text-earth-800"}`}>
        {booking.customerName}
      </span>
    </button>
  );
}

function MoreBookingsPopover({
  dateKey,
  remaining,
  highlightStaff,
  onBookingClick,
}: {
  dateKey: string;
  remaining: BookingEntry[];
  highlightStaff: string | null;
  onBookingClick?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative z-10 px-1.5 pb-1.5">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="text-[10px] font-semibold text-primary-600 hover:text-primary-700"
        title="展開全部預約"
      >
        +{remaining.length} 更多
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-20 mt-1 min-w-[200px] max-h-[280px] overflow-y-auto rounded-md border border-earth-200 bg-white p-2 shadow-[0_8px_24px_rgba(20,24,31,0.12)]"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-earth-400">
            {dateKey.slice(5)} 其他預約（{remaining.length}）
          </p>
          <div className="flex flex-col gap-1">
            {remaining.map((b) => (
              <BookingStrip
                key={b.id}
                booking={b}
                highlightStaff={highlightStaff}
                onClick={
                  onBookingClick
                    ? (e) => {
                        e.stopPropagation();
                        setOpen(false);
                        onBookingClick(b.id);
                      }
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
