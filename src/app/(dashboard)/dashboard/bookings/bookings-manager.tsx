"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { fetchDayDetail } from "@/server/actions/slots";
import type { SlotAvailability } from "@/types";
import { BookingCalendarDesktop } from "./booking-calendar-desktop";
import { DayDetailPanel, type DayBooking } from "./day-detail-panel";
import { BookingDetailDrawer } from "./booking-detail-drawer";

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

interface MonthSummaryDay {
  date: string;
  totalBookingCount: number;
  totalPeople: number;
  staffBookings: Array<{ staffName: string; colorCode: string; count: number }>;
  // `bookings` 目前 main 的 getMonthBookingSummary 尚未回傳 per-day 清單；日層 UI 改
  // 以 onDaySelect 即時取 fetchDayDetail 為主。此欄位保留以相容未來擴充。
  bookings?: BookingEntry[];
}

interface ServicePlanOption {
  id: string;
  name: string;
}

const STATUS_OPTIONS = [
  { value: "PENDING", label: "預約中" },
  { value: "CONFIRMED", label: "已確認" },
  { value: "CHECKED_IN", label: "已到店" },
  { value: "COMPLETED", label: "已完成" },
  { value: "NO_SHOW", label: "未到" },
] as const;

export interface BookingFilters {
  staffName: string;
  status: string;
  servicePlanId: string;
  search: string;
}

const EMPTY_FILTERS: BookingFilters = {
  staffName: "",
  status: "",
  servicePlanId: "",
  search: "",
};

interface BookingsManagerProps {
  year: number;
  month: number;
  monthData: MonthSummaryDay[];
  servicePlans: ServicePlanOption[];
}

export function BookingsManager({
  year,
  month,
  monthData,
  servicePlans,
}: BookingsManagerProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayBookings, setDayBookings] = useState<DayBooking[]>([]);
  const [daySlots, setDaySlots] = useState<SlotAvailability[]>([]);
  const [isPending, startTransition] = useTransition();
  const [filters, setFilters] = useState<BookingFilters>(EMPTY_FILTERS);
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);
  const router = useRouter();

  // Staff options extracted from monthData (unique staff names)
  const staffOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const day of monthData) {
      for (const s of day.staffBookings) {
        if (!map.has(s.staffName)) map.set(s.staffName, s.colorCode);
      }
    }
    return Array.from(map.entries())
      .map(([name, color]) => ({ name, color }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
  }, [monthData]);

  // Filter bookings for day-detail panel (client-side)
  const filteredDayBookings = useMemo(() => {
    return dayBookings.filter((b) => {
      if (filters.status && b.bookingStatus !== filters.status) return false;
      if (filters.staffName) {
        const staffName =
          b.revenueStaff?.displayName ??
          b.serviceStaff?.displayName ??
          b.customer?.assignedStaff?.displayName ??
          "";
        if (staffName !== filters.staffName) return false;
      }
      if (filters.servicePlanId) {
        // DayBooking only has servicePlan.name, not id — match by name via lookup
        const plan = servicePlans.find((p) => p.id === filters.servicePlanId);
        if (!plan || b.servicePlan?.name !== plan.name) return false;
      }
      if (filters.search) {
        const q = filters.search.trim().toLowerCase();
        const name = b.customer?.name?.toLowerCase() ?? "";
        const phone = b.customer?.phone ?? "";
        if (!name.includes(q) && !phone.includes(q)) return false;
      }
      return true;
    });
  }, [dayBookings, filters, servicePlans]);

  // Calendar: dim days that don't contain the selected staff
  const dimmedDates = useMemo(() => {
    if (!filters.staffName) return new Set<string>();
    const dim = new Set<string>();
    for (const day of monthData) {
      const hit = day.staffBookings.some(
        (s) => s.staffName === filters.staffName,
      );
      if (!hit && day.totalBookingCount > 0) dim.add(day.date);
    }
    return dim;
  }, [monthData, filters.staffName]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const handleDaySelect = useCallback(
    (dateKey: string) => {
      setSelectedDate(dateKey);
      startTransition(async () => {
        const result = await fetchDayDetail(dateKey);
        setDayBookings(result.bookings as DayBooking[]);
        setDaySlots(result.slots);
      });
    },
    [],
  );

  const openBooking = useCallback((id: string) => {
    setActiveBookingId(id);
  }, []);

  const closeBooking = useCallback(() => {
    setActiveBookingId(null);
  }, []);

  const handleBookingUpdated = useCallback(() => {
    // re-fetch current day panel + revalidate month
    if (selectedDate) {
      startTransition(async () => {
        const result = await fetchDayDetail(selectedDate);
        setDayBookings(result.bookings as DayBooking[]);
        setDaySlots(result.slots);
      });
    }
    router.refresh();
  }, [selectedDate, router]);

  return (
    <div className="flex flex-col gap-4">
      <Toolbar
        year={year}
        month={month}
        onJumpToday={handleDaySelect}
        filters={filters}
        setFilters={setFilters}
        staffOptions={staffOptions}
        servicePlans={servicePlans}
        activeFilterCount={activeFilterCount}
      />

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-8">
          <BookingCalendarDesktop
            year={year}
            month={month}
            monthData={monthData}
            selectedDate={selectedDate}
            onDaySelect={handleDaySelect}
            onBookingClick={openBooking}
            highlightStaff={filters.staffName || null}
            dimmedDates={dimmedDates}
          />
        </div>
        <div className="col-span-12 lg:col-span-4">
          <DayDetailPanel
            date={selectedDate}
            bookings={filteredDayBookings}
            slots={daySlots}
            loading={isPending}
            onBookingClick={openBooking}
            filteredFrom={
              dayBookings.length !== filteredDayBookings.length
                ? dayBookings.length
                : null
            }
          />
        </div>
      </div>

      <BookingDetailDrawer
        open={!!activeBookingId}
        bookingId={activeBookingId}
        onClose={closeBooking}
        onUpdated={handleBookingUpdated}
      />
    </div>
  );
}

function Toolbar({
  year,
  month,
  onJumpToday,
  filters,
  setFilters,
  staffOptions,
  servicePlans,
  activeFilterCount,
}: {
  year: number;
  month: number;
  onJumpToday: (dateKey: string) => void;
  filters: BookingFilters;
  setFilters: (f: BookingFilters) => void;
  staffOptions: Array<{ name: string; color: string }>;
  servicePlans: ServicePlanOption[];
  activeFilterCount: number;
}) {
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const todayIso = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Taipei",
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-earth-200 bg-white px-4 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/dashboard/bookings?year=${prevYear}&month=${prevMonth}`}
          className="inline-flex h-7 w-7 items-center justify-center rounded border border-earth-300 text-earth-600 hover:bg-earth-50"
          aria-label="上個月"
        >
          ‹
        </Link>
        <span className="min-w-[90px] text-center text-sm font-semibold text-earth-900">
          {year} 年 {month} 月
        </span>
        <Link
          href={`/dashboard/bookings?year=${nextYear}&month=${nextMonth}`}
          className="inline-flex h-7 w-7 items-center justify-center rounded border border-earth-300 text-earth-600 hover:bg-earth-50"
          aria-label="下個月"
        >
          ›
        </Link>
        <button
          type="button"
          onClick={() => onJumpToday(todayIso)}
          className="ml-2 inline-flex h-7 items-center rounded border border-earth-300 bg-white px-3 text-xs font-semibold text-earth-700 hover:bg-earth-50"
        >
          今日
        </button>
        <span className="mx-2 h-5 w-px bg-earth-200" />
        <FilterSelect
          label="教練"
          value={filters.staffName}
          onChange={(v) => setFilters({ ...filters, staffName: v })}
          options={staffOptions.map((s) => ({ value: s.name, label: s.name }))}
        />
        <FilterSelect
          label="狀態"
          value={filters.status}
          onChange={(v) => setFilters({ ...filters, status: v })}
          options={STATUS_OPTIONS.map((s) => ({
            value: s.value,
            label: s.label,
          }))}
        />
        <FilterSelect
          label="服務"
          value={filters.servicePlanId}
          onChange={(v) => setFilters({ ...filters, servicePlanId: v })}
          options={servicePlans.map((p) => ({ value: p.id, label: p.name }))}
        />
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="inline-flex h-7 items-center rounded border border-earth-300 bg-earth-50 px-2.5 text-xs font-medium text-earth-600 hover:bg-earth-100"
            title="清除所有篩選"
          >
            清除 ({activeFilterCount})
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="relative">
          <input
            type="search"
            placeholder="搜尋顧客 / 手機"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="h-7 w-56 rounded border border-earth-300 bg-white pl-7 pr-3 text-sm text-earth-700 placeholder:text-earth-400 focus:border-primary-500 focus:outline-none"
          />
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-earth-400">
            ⌕
          </span>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const active = !!value;
  return (
    <label
      className={`inline-flex h-7 items-center gap-1 rounded border pl-2.5 pr-1 text-xs font-medium transition-colors ${
        active
          ? "border-primary-500 bg-primary-50 text-primary-700"
          : "border-earth-300 bg-white text-earth-700 hover:bg-earth-50"
      }`}
    >
      <span className="select-none">{label}：</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 cursor-pointer border-0 bg-transparent text-xs font-medium focus:outline-none"
      >
        <option value="">全部</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
