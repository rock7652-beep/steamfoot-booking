"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { fetchDaySlots } from "@/server/actions/slots";
import {
  markCompleted,
  markCompletedBatch,
} from "@/server/actions/booking";
import type { SlotAvailability } from "@/types";
import { BookingCalendarDesktop } from "./booking-calendar-desktop";
import { DayDetailPanel, type DayBooking } from "./day-detail-panel";
import {
  BookingDetailDrawer,
  type BookingSummary,
} from "./booking-detail-drawer";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/booking-constants";

const COMPLETABLE_STATUSES = new Set(["PENDING", "CONFIRMED"]);

/**
 * monthData entry — server returns a flat-summary-plus-nested-detail shape
 * so the day panel can render directly from cached month data without a
 * second per-day round-trip. Flat fields (customerName / staffId / etc.)
 * power the calendar strip; nested objects mirror the DayBooking shape so
 * we can derive `dayBookings` via `useMemo`.
 */
interface BookingEntry {
  id: string;
  slotTime: string;
  bookingStatus: string;
  isMakeup: boolean;
  isCheckedIn: boolean;
  people: number;
  customerName: string;
  staffId: string | null;
  staffName: string | null;
  staffColor: string | null;
  customer: {
    id: string;
    name: string;
    phone: string;
    assignedStaff: {
      id: string;
      displayName: string;
      colorCode: string;
    } | null;
  };
  revenueStaff: { id: string; displayName: string; colorCode: string } | null;
  serviceStaff: { id: string; displayName: string } | null;
  servicePlan: { name: string } | null;
}

interface MonthSummaryDay {
  date: string;
  totalBookingCount: number;
  totalPeople: number;
  staffBookings: Array<{ staffName: string; colorCode: string; count: number }>;
  bookings?: BookingEntry[];
}

interface ServicePlanOption {
  id: string;
  name: string;
}

// main schema BookingStatus 僅有 PENDING / CONFIRMED / COMPLETED / CANCELLED / NO_SHOW
// （CHECKED_IN 在未 merge 的 migration 裡，本輪不引入）
const STATUS_OPTIONS = [
  { value: "PENDING", label: "預約中" },
  { value: "CONFIRMED", label: "已確認" },
  { value: "COMPLETED", label: "已完成" },
  { value: "NO_SHOW", label: "未到" },
] as const;

const ACTIVE_STATUS_SET = new Set<string>(ACTIVE_BOOKING_STATUSES);

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
  monthData: initialMonthData,
  servicePlans,
}: BookingsManagerProps) {
  // monthData lifted into client state so we can patch a single booking
  // optimistically (status flip / cancel) without re-fetching the entire
  // month. Sync back from prop whenever year / month / server data changes.
  const [monthData, setMonthData] = useState(initialMonthData);
  useEffect(() => {
    setMonthData(initialMonthData);
  }, [initialMonthData]);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // Slots cache, keyed by date string. Bookings are derived from monthData
  // (no per-day fetch); slots are still fetched on demand because they
  // require business-hours / duty / overrides resolution that isn't part of
  // the month query — but each date is fetched at most once per session.
  const [slotsCache, setSlotsCache] = useState<Map<string, SlotAvailability[]>>(
    () => new Map(),
  );
  // Mirror cache in a ref so handleDaySelect can read latest cache without
  // depending on it (avoids the callback identity churning every fetch and
  // re-issuing startTransition during the resulting cascade re-render).
  const slotsCacheRef = useRef(slotsCache);
  useEffect(() => {
    slotsCacheRef.current = slotsCache;
  }, [slotsCache]);
  const [slotsLoadingDate, setSlotsLoadingDate] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [filters, setFilters] = useState<BookingFilters>(EMPTY_FILTERS);
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);
  const [activeSummary, setActiveSummary] = useState<BookingSummary | null>(
    null,
  );

  // Batch / inline action state
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [actingIds, setActingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [batchActing, setBatchActing] = useState(false);

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

  // bookingId → summary lookup. Drives the drawer's instant header render
  // — calendar / day panel hand the click straight to the drawer with the
  // summary already in hand, so there's no fetch latency on open.
  const summaryById = useMemo(() => {
    const map = new Map<string, BookingSummary>();
    for (const day of monthData) {
      for (const b of day.bookings ?? []) {
        map.set(b.id, monthEntryToSummary(b, day.date));
      }
    }
    return map;
  }, [monthData]);

  /**
   * Day panel bookings — derived from already-loaded `monthData`. Switching
   * date is now a pure client-side `useMemo` (no server round-trip), which
   * was the dominant cost of the old `fetchDayDetail` path.
   */
  const dayBookings = useMemo<DayBooking[]>(() => {
    if (!selectedDate) return [];
    const day = monthData.find((d) => d.date === selectedDate);
    if (!day?.bookings) return [];
    return day.bookings.map((b) => ({
      id: b.id,
      slotTime: b.slotTime,
      people: b.people,
      isMakeup: b.isMakeup,
      isCheckedIn: b.isCheckedIn,
      bookingStatus: b.bookingStatus,
      customer: b.customer,
      revenueStaff: b.revenueStaff,
      serviceStaff: b.serviceStaff,
      servicePlan: b.servicePlan,
    }));
  }, [monthData, selectedDate]);

  const daySlots: SlotAvailability[] = selectedDate
    ? (slotsCache.get(selectedDate) ?? [])
    : [];
  const slotsKnown = !!selectedDate && slotsCache.has(selectedDate);
  const slotsLoadingForSelected = slotsLoadingDate === selectedDate;

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
      // Switching day discards the prior selection — those bookings are no
      // longer visible, batch action would be confusing.
      setSelectedIds(new Set());

      // Fire slots fetch only on cache miss; consecutive clicks on a date
      // we've already loaded touch nothing on the server. Read via ref so
      // the callback identity stays stable — otherwise the calendar
      // re-renders on every cache update and React 19 reports the
      // resulting startTransition as render-phase.
      if (slotsCacheRef.current.has(dateKey)) return;
      setSlotsLoadingDate(dateKey);
      startTransition(async () => {
        try {
          const result = await fetchDaySlots(dateKey);
          setSlotsCache((prev) => {
            const next = new Map(prev);
            next.set(dateKey, result.slots);
            return next;
          });
        } finally {
          setSlotsLoadingDate((cur) => (cur === dateKey ? null : cur));
        }
      });
    },
    [],
  );

  const openBooking = useCallback(
    (id: string) => {
      setActiveBookingId(id);
      setActiveSummary(summaryById.get(id) ?? null);
    },
    [summaryById],
  );

  const closeBooking = useCallback(() => {
    setActiveBookingId(null);
    setActiveSummary(null);
  }, []);

  // Apply optimistic status change to monthData; dayBookings re-derives via
  // useMemo. Replaces the old `router.refresh()` + `fetchDayDetail` re-run
  // (which together fired 5+ DB queries per action).
  //
  // Reschedule (newStatus = null) is left as-is — monthData stays stale
  // for the moved booking until next nav. Trade-off worth taking: the
  // operations that happen many times a day (完成 / 取消 / 標記未到) all
  // have a known target status and are fully covered.
  const handleBookingUpdated = useCallback(
    (bookingId: string, newStatus: string | null) => {
      if (!newStatus) return;
      setMonthData((prev) =>
        prev.map((day) => {
          if (!day.bookings) return day;
          const idx = day.bookings.findIndex((b) => b.id === bookingId);
          if (idx === -1) return day;
          const isStillActive = ACTIVE_STATUS_SET.has(newStatus);
          const targetBooking = day.bookings[idx];
          if (!isStillActive) {
            const nextBookings = day.bookings.filter(
              (b) => b.id !== bookingId,
            );
            return {
              ...day,
              bookings: nextBookings,
              totalBookingCount: Math.max(0, day.totalBookingCount - 1),
              totalPeople: Math.max(
                0,
                day.totalPeople - targetBooking.people,
              ),
            };
          }
          const nextBookings = [...day.bookings];
          nextBookings[idx] = {
            ...targetBooking,
            bookingStatus: newStatus,
            isCheckedIn:
              newStatus === "COMPLETED" ? true : targetBooking.isCheckedIn,
          };
          return { ...day, bookings: nextBookings };
        }),
      );
    },
    [],
  );

  // ── Batch / inline complete wiring ────────────────────────────

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllActionable = useCallback(() => {
    setSelectedIds(
      new Set(
        dayBookings
          .filter((b) => COMPLETABLE_STATUSES.has(b.bookingStatus))
          .map((b) => b.id),
      ),
    );
  }, [dayBookings]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const completeSingle = useCallback(
    async (id: string) => {
      // Lock just this row — batch UI bar won't show anything if no selection.
      setActingIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      try {
        const r = await markCompleted(id);
        if (r.success) {
          toast.success("已完成服務");
          handleBookingUpdated(id, "COMPLETED");
          setSelectedIds((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        } else {
          toast.error(r.error ?? "操作失敗");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "操作失敗");
      } finally {
        setActingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [handleBookingUpdated],
  );

  const completeBatch = useCallback(async () => {
    // Defensive: only ids whose current row is still actionable.
    const ids = dayBookings
      .filter(
        (b) =>
          selectedIds.has(b.id) && COMPLETABLE_STATUSES.has(b.bookingStatus),
      )
      .map((b) => b.id);
    if (ids.length === 0) return;
    setBatchActing(true);
    try {
      const { results } = await markCompletedBatch(ids);
      let okCount = 0;
      const failed: Array<{ id: string; error: string }> = [];
      const succeededIds: string[] = [];
      for (const r of results) {
        if (r.success) {
          okCount += 1;
          succeededIds.push(r.id);
          handleBookingUpdated(r.id, "COMPLETED");
        } else {
          failed.push({ id: r.id, error: r.error ?? "操作失敗" });
        }
      }
      if (okCount > 0) {
        toast.success(`已完成 ${okCount} 位`);
      }
      if (failed.length > 0) {
        // Per-id detail isn't useful in toast; aggregate label + first reason.
        toast.error(
          `${failed.length} 筆失敗${failed[0].error ? `：${failed[0].error}` : ""}`,
        );
      }
      // Drop succeeded ids from selection; failed ones stay so the店長 can
      // see what's still selected and retry / inspect.
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of succeededIds) next.delete(id);
        return next;
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "批次操作失敗");
    } finally {
      setBatchActing(false);
    }
  }, [dayBookings, selectedIds, handleBookingUpdated]);

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
            slotsKnown={slotsKnown}
            slotsLoading={slotsLoadingForSelected}
            onBookingClick={openBooking}
            filteredFrom={
              dayBookings.length !== filteredDayBookings.length
                ? dayBookings.length
                : null
            }
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onSelectAllActionable={selectAllActionable}
            onClearSelection={clearSelection}
            onCompleteBatch={completeBatch}
            onCompleteSingle={completeSingle}
            actingIds={actingIds}
            batchActing={batchActing}
          />
        </div>
      </div>

      <BookingDetailDrawer
        open={!!activeBookingId}
        bookingId={activeBookingId}
        summary={activeSummary}
        onClose={closeBooking}
        onUpdated={handleBookingUpdated}
      />
    </div>
  );
}

function monthEntryToSummary(b: BookingEntry, date: string): BookingSummary {
  return {
    id: b.id,
    bookingDate: date,
    slotTime: b.slotTime,
    bookingStatus: b.bookingStatus,
    isMakeup: b.isMakeup,
    people: b.people,
    customerName: b.customerName,
    servicePlanName: b.servicePlan?.name ?? null,
    servicePlanCategory: null,
  };
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
