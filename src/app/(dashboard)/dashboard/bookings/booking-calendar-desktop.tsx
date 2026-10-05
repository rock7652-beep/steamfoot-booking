"use client";

import styles from "./booking-layout.module.css";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { BookingMonthLink } from "./booking-month-link";

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

interface BookingEntry {
  id: string;
  slotTime: string;
  customerName: string;
  bookingStatus: string;
  isMakeup: boolean;
  people: number;
  recurrenceIndex?: number | null;
  recurrenceTotalOccurrences?: number | null;
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

type DayScheduleInfo = {
  status: "open" | "closed" | "training" | "custom";
  slotCount: number;
};
type MonthScheduleMap = Record<string, DayScheduleInfo>;

const SCHEDULE_LABEL: Record<DayScheduleInfo["status"], string | null> = {
  open: null,
  custom: null,
  closed: "公休",
  training: "進修",
};

// 月曆只以淡底色表示出席狀態，不再混用人員色條。
const STATUS_STYLE: Record<string, { bg: string; label: string }> = {
  PENDING: { bg: "bg-earth-50", label: "預約中" },
  CONFIRMED: { bg: "bg-earth-50", label: "預約中" },
  COMPLETED: { bg: "bg-green-50", label: "已完成" },
  NO_SHOW: { bg: "bg-red-50", label: "未到" },
  CANCELLED: { bg: "bg-earth-50", label: "已取消" },
};

interface BookingCalendarDesktopProps {
  year: number;
  month: number;
  compactHeader?: boolean;
  headerActions?: ReactNode;
  monthData: MonthSummaryDay[];
  /** 該月每日營業狀態（open/closed/training/custom）+ slotCount。
   *  空 map 代表「無法判斷」（例如 ADMIN __all__），UI 退化為 generic 樣式。 */
  monthSchedule?: MonthScheduleMap;
  selectedDate: string | null;
  onDaySelect: (dateKey: string) => void;
  onBookingClick?: (bookingId: string) => void;
  basePath?: string;
  /** 指定教練名稱時：cell 內其他教練的預約淡化，狀態底色保持不變 */
  highlightStaff?: string | null;
  /** 篩選後無符合資料的日期（cell 整體變灰） */
  dimmedDates?: Set<string>;
}

export function BookingCalendarDesktop({
  year,
  month,
  monthData,
  monthSchedule,
  selectedDate,
  onDaySelect,
  onBookingClick,
  basePath = "",
  highlightStaff = null,
  dimmedDates,
  compactHeader = false,
  headerActions,
}: BookingCalendarDesktopProps) {
  const firstDayOfMonth = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const prevMonthLastDay = new Date(year, month - 1, 0).getDate();

  // 今日判定一律以台灣時區為準（client 端若在非台北時區會算錯月曆高亮）
  // Intl 的 "en-CA" locale 回傳 YYYY-MM-DD 格式，穩定可比對。
  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [todayY, todayM] = todayStr.split("-").map(Number);
  const isCurrentMonth = year === todayY && month === todayM;

  const monthLabel = `${year} 年 ${month} 月`;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  const byDate = new Map(monthData.map((d) => [d.date, d]));

  const totalCells = Math.ceil((firstDayOfMonth + daysInMonth) / 7) * 7;
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
    <div aria-label={compactHeader ? `${monthLabel}預約月曆` : undefined} className={`${styles.calendar} min-w-0 rounded-lg border border-earth-200 bg-white ${compactHeader ? "px-3 py-2" : "p-4"}`}>
      {!compactHeader && <div className="flex items-center justify-between gap-3 pb-3">
        <h2 className="text-lg font-semibold text-earth-900">{monthLabel}</h2>
        <div className="flex items-center gap-2">
          <BookingMonthLink
            href={`${basePath}?year=${prevYear}&month=${prevMonth}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-earth-300 text-earth-600 hover:bg-earth-50"
          year={prevYear} month={prevMonth} direction="previous"
        />
          {!isCurrentMonth && (
            <Link
              href={basePath || "/dashboard/bookings"}
              className="inline-flex h-7 items-center rounded border border-earth-300 bg-white px-3 text-xs font-semibold text-earth-700 hover:bg-earth-50"
            >
              今日
            </Link>
          )}
          <BookingMonthLink
            href={`${basePath}?year=${nextYear}&month=${nextMonth}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-earth-300 text-earth-600 hover:bg-earth-50"
          year={nextYear} month={nextMonth} direction="next"
        />
        </div>
      </div>}

      <div className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 ${compactHeader ? "pb-1" : "pb-2"}`}>
      <div aria-label="預約狀態顏色說明" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-earth-700">
        {[STATUS_STYLE.PENDING, STATUS_STYLE.COMPLETED, STATUS_STYLE.NO_SHOW].map((status) => (
          <span key={status.label} className="inline-flex items-center gap-1">
            <span aria-hidden="true" className={`h-3 w-3 rounded-sm border border-earth-200 ${status.bg}`} />
            {status.label}
          </span>
        ))}
      </div>

      {headerActions}
      </div>

      <div className="max-w-full overflow-auto overscroll-x-contain" tabIndex={0} role="region" aria-label="預約月曆捲動區">
      <div className="min-w-[700px]">
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
          const schedule = cell.isoDate ? monthSchedule?.[cell.isoDate] : null;
          const isClosed =
            !!schedule &&
            (schedule.status === "closed" || schedule.status === "training");
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
                : isClosed
                  ? "bg-earth-100/60 hover:bg-earth-100"
                  : "bg-white hover:bg-earth-50";

          const dateNumberCls = !cell.inMonth
            ? "text-earth-300"
            : isClosed
              ? "text-earth-400"
              : weekdayIdx === 0
                ? "text-red-500"
                : weekdayIdx === 6
                  ? "text-blue-500"
                  : "text-earth-700";

          const allBookings = data?.bookings ?? [];
          const visibleBookings = allBookings.slice(0, 5);
          const remainingBookings = allBookings.slice(5);
          const bookingCount = data?.totalBookingCount ?? 0;
          const scheduleLabel = schedule ? SCHEDULE_LABEL[schedule.status] : null;

          const handleDaySelect = () => {
            if (cell.isoDate) onDaySelect(cell.isoDate);
          };
          const handleKey = (e: React.KeyboardEvent) => {
            if (e.target !== e.currentTarget) return;
            if (!cell.isoDate) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onDaySelect(cell.isoDate);
            }
          };

          // 用 role="button" div 代替外層 <button>，避免與內層 BookingStrip 的 <button>
          // 構成 nested <button>（HTML 無效，React 19 會報 hydration error）。
          return (
            <div
              key={cell.key}
              role={cell.isoDate ? "button" : undefined}
              tabIndex={cell.isoDate ? 0 : -1}
              aria-label={cell.isoDate ? `${cell.isoDate} 的預約` : undefined}
              onClick={handleDaySelect}
              onKeyDown={handleKey}
              className={`relative flex min-h-[72px] flex-col text-left transition-colors ${borderCls} ${bgCls} ${
                isDimmed ? "opacity-40" : ""
              } ${cell.isoDate ? "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-inset" : "cursor-default"}`}
            >
              <div className="flex flex-1 flex-col gap-0.5 px-1 py-1">
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={`inline-flex h-6 min-w-6 items-center justify-center text-sm font-semibold tabular-nums ${
                      isToday && cell.inMonth
                        ? "rounded-full bg-primary-600 px-1.5 text-white"
                        : dateNumberCls
                    }`}
                  >
                    {cell.dayNum}
                  </span>
                  {cell.inMonth && (
                    <CellMeta
                      bookingCount={bookingCount}
                      totalPeople={data?.totalPeople ?? 0}
                      scheduleLabel={scheduleLabel}
                      isClosed={isClosed}
                    />
                  )}
                </div>

                {cell.inMonth && bookingCount > 0 && (
                  <div className="flex flex-col gap-0.5">
                    {visibleBookings.map((b) => (
                      <BookingStrip
                        key={b.id}
                        booking={b}
                        highlightStaff={highlightStaff}
                        onSelect={onBookingClick}
                      />
                    ))}
                  </div>
                )}
              </div>
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
      </div>
    </div>
  );
}

/**
 * 右上角資訊塊：closed/training → 灰底文字標籤；
 * 開放日 + 有預約 → 「N筆 · M人」；開放日 + 0 預約 → 淡灰「0筆」。
 * 沒有 schedule 資料時退化成只顯示有預約的情況（與舊行為一致）。
 */
function CellMeta({
  bookingCount,
  totalPeople,
  scheduleLabel,
  isClosed,
}: {
  bookingCount: number;
  totalPeople: number;
  scheduleLabel: string | null;
  isClosed: boolean;
}) {
  if (isClosed && scheduleLabel) {
    return (
      <span className="rounded bg-earth-200 px-1 text-[10px] font-medium text-earth-500">
        {scheduleLabel}
      </span>
    );
  }
  if (bookingCount > 0) {
    return (
      <span className="text-[10px] font-medium text-earth-500 tabular-nums">
        {bookingCount}筆 · {totalPeople}人
      </span>
    );
  }
  return (
    <span className="text-[10px] text-earth-300 tabular-nums">0筆</span>
  );
}

/**
 * Day-cell booking row. Wrapped in `memo` so the 42-cell grid doesn't
 * re-render every strip when only the parent's drawer / day-panel state
 * changes — this is the dominant re-render path on heavy months.
 *
 * Memo identity is per-strip booking + highlightStaff + onClick handler,
 * so parents must keep their click handler stable (`useCallback`).
 */
const BookingStrip = memo(function BookingStrip({
  booking,
  highlightStaff,
  onSelect,
}: {
  booking: BookingEntry;
  highlightStaff: string | null;
  /** Stable handler from parent; receives booking id. Component handles
   *  stopPropagation so memo identity stays clean. */
  onSelect?: (id: string) => void;
}) {
  const dimmed = !!(highlightStaff && booking.staffName !== highlightStaff);
  const style =
    STATUS_STYLE[booking.bookingStatus] ?? STATUS_STYLE.PENDING;

  const clickable = !!onSelect;

  return (
    <button
      type="button"
      onClick={
        onSelect
          ? (e) => {
              e.stopPropagation();
              onSelect(booking.id);
            }
          : undefined
      }
      disabled={!clickable}
      className={`${styles.calendarBooking} flex w-full items-center gap-1 truncate rounded-[3px] px-1 text-left text-sm font-medium ${style.bg} ${
        dimmed ? "opacity-50" : ""
      } ${clickable ? "cursor-pointer hover:brightness-95" : "cursor-default"}`}
      title={`${booking.slotTime} ${booking.customerName} · ${style.label} · ${booking.staffName ?? "未指派"}`}
    >
      <span className="shrink-0 tabular-nums text-earth-800">
        {booking.slotTime}
      </span>
      <span className="truncate text-earth-800">
        {booking.customerName}
      </span>
      {booking.recurrenceIndex && booking.recurrenceTotalOccurrences ? (
        <span className="shrink-0 rounded bg-violet-100 px-1 text-[9px] font-semibold text-violet-700">
          固定 {booking.recurrenceIndex}/{booking.recurrenceTotalOccurrences}
        </span>
      ) : null}
    </button>
  );
});

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
        aria-expanded={open}
        className={`${styles.calendarMore} w-full text-left text-sm font-semibold text-primary-600 hover:text-primary-700`}
        title="展開全部預約"
      >
        {open ? "收合" : `＋${remaining.length} 筆`}
      </button>
      {open && (
        <div
          className="mt-1 max-h-[280px] overflow-y-auto rounded-md border border-earth-200 bg-white p-1"
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
                onSelect={
                  onBookingClick
                    ? (id) => {
                        setOpen(false);
                        onBookingClick(id);
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
