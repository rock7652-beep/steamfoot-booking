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
  type BookingPrefill,
} from "./booking-detail-drawer";
import {
  createBookingDetailCache,
  type BookingDetailCache,
} from "./booking-detail-cache";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/booking-constants";
import { RightSheet } from "@/components/admin/right-sheet";
import { formatWeekdayZh } from "@/lib/date-utils";

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
  recurrenceIndex: number | null;
  recurrenceTotalOccurrences: number | null;
  customerConfirmedAt: Date | null;
  /** PR-3d：實際到店人數（FIRST_TRIAL；null = 未記錄／全到）。 */
  attendedPeople: number | null;
  bookingType: string;
  expectedAmount: number | null;
  // PR-D1D：FIRST_TRIAL badge fallback 來源；其他 type 為 null。鏡像
  // getMonthBookingSummary 的 DayBookingEntry。
  trialDefaultPrice: number | null;
  collected: boolean;
  collectedAmount: number | null;
  customerName: string;
  staffId: string | null;
  staffName: string | null;
  staffColor: string | null;
  customer: {
    id: string;
    name: string;
    phone: string;
    serviceNote: string | null;
    assignedStaff: {
      id: string;
      displayName: string;
      colorCode: string;
    } | null;
    // 有效 PACKAGE 剩餘堂數加總（鏡像 getMonthBookingSummary）。0 = 無有效方案。
    validPackageSessions: number;
  };
  revenueStaff: { id: string; displayName: string; colorCode: string } | null;
  serviceStaff: { id: string; displayName: string } | null;
  servicePlan: { name: string } | null;
  customerPlanWallet: { plan: { name: string } } | null;
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

/**
 * 該日營業狀態摘要 — 從 server 端 getCachedMonthScheduleSummary 來。
 * status: open / custom = 開放預約；closed / training = 不開放
 * slotCount: 該日可預約時段數（0 代表沒設營業時間）
 *
 * 全店視角（ADMIN __all__）會收到空 map → UI 會視為「無法判斷」，
 * 不會誤標成公休。
 */
type DayScheduleInfo = {
  status: "open" | "closed" | "training" | "custom";
  slotCount: number;
};
export type MonthScheduleMap = Record<string, DayScheduleInfo>;

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
  monthSchedule: MonthScheduleMap;
  servicePlans: ServicePlanOption[];
  readOnly?: boolean;
  initialBookingId?: string | null;
}

export function BookingsManager({
  year,
  month,
  monthData: initialMonthData,
  monthSchedule,
  servicePlans,
  readOnly = false,
  initialBookingId = null,
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
  const [activeBookingId, setActiveBookingId] = useState<string | null>(
    initialBookingId,
  );
  const [activeSummary, setActiveSummary] = useState<BookingSummary | null>(
    null,
  );
  // Richer prefill snapshot for the open drawer — lets the body render basic
  // sections instantly from in-memory day-list data (no fetch).
  const [activePrefill, setActivePrefill] = useState<BookingPrefill | null>(
    null,
  );
  // Shared client-side detail cache (SWR + dedupe), stable across renders.
  // Owned here so drawer actions can invalidate it centrally after mutations.
  const detailCacheRef = useRef<BookingDetailCache | null>(null);
  if (!detailCacheRef.current) {
    detailCacheRef.current = createBookingDetailCache();
  }
  const detailCache = detailCacheRef.current;

  // Batch / inline action state
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [actingIds, setActingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [batchActing, setBatchActing] = useState(false);

  useEffect(() => {
    if (readOnly) {
      setSelectedIds(new Set());
      setActingIds(new Set());
      setBatchActing(false);
    }
  }, [readOnly]);

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

  // bookingId → prefill lookup. Drives the drawer's instant **body** render
  // (basic 預約資訊 / 顧客 / 金額提示) straight from monthData — no fetch.
  const prefillById = useMemo(() => {
    const map = new Map<string, BookingPrefill>();
    for (const day of monthData) {
      for (const b of day.bookings ?? []) {
        map.set(b.id, monthEntryToPrefill(b, day.date));
      }
    }
    return map;
  }, [monthData]);

  const deepLinkAppliedRef = useRef(false);
  useEffect(() => {
    if (!initialBookingId || deepLinkAppliedRef.current) return;
    deepLinkAppliedRef.current = true;
    setActiveBookingId(initialBookingId);
    setActiveSummary(summaryById.get(initialBookingId) ?? null);
    setActivePrefill(prefillById.get(initialBookingId) ?? null);
  }, [initialBookingId, prefillById, summaryById]);

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
      recurrenceIndex: b.recurrenceIndex,
      recurrenceTotalOccurrences: b.recurrenceTotalOccurrences,
      customerConfirmedAt: b.customerConfirmedAt,
      attendedPeople: b.attendedPeople,
      isMakeup: b.isMakeup,
      isCheckedIn: b.isCheckedIn,
      bookingStatus: b.bookingStatus,
      bookingType: b.bookingType,
      expectedAmount: b.expectedAmount,
      trialDefaultPrice: b.trialDefaultPrice,
      collected: b.collected,
      collectedAmount: b.collectedAmount,
      customer: b.customer,
      revenueStaff: b.revenueStaff,
      serviceStaff: b.serviceStaff,
      servicePlan: b.servicePlan,
      customerPlanWallet: b.customerPlanWallet,
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
      // 點「查看」直接清掉選取日期：關閉 Booking Detail 後回到月曆，
      // 不自動重開當日 Drawer。
      setSelectedDate(null);
      setActiveBookingId(id);
      setActiveSummary(summaryById.get(id) ?? null);
      setActivePrefill(prefillById.get(id) ?? null);
    },
    [summaryById, prefillById],
  );

  const closeBooking = useCallback(() => {
    setActiveBookingId(null);
    setActiveSummary(null);
    setActivePrefill(null);
  }, []);

  const closeDay = useCallback(() => {
    setSelectedDate(null);
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
      // C：任何 mutation（收款 / 完成 / 改時間 / 標記未到 / 取消 / 調整結帳，
      // 含 newStatus=null 的收款/改期）都先 invalidate 該筆 detail cache，
      // 下次打開 / 背景 revalidate 一定取得最新 authoritative payload。
      detailCache.invalidate(bookingId);
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
    [detailCache],
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
      if (readOnly) {
        toast.error("查看模式下不可操作預約");
        return;
      }
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
    [handleBookingUpdated, readOnly],
  );

  const completeBatch = useCallback(async () => {
    if (readOnly) {
      toast.error("查看模式下不可操作預約");
      return;
    }
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
  }, [dayBookings, selectedIds, handleBookingUpdated, readOnly]);

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
        <div className="col-span-12">
          <BookingCalendarDesktop
            year={year}
            month={month}
            monthData={monthData}
            monthSchedule={monthSchedule}
            selectedDate={selectedDate}
            onDaySelect={handleDaySelect}
            onBookingClick={openBooking}
            highlightStaff={filters.staffName || null}
            dimmedDates={dimmedDates}
          />
        </div>
      </div>

      {/* 當日預約改用右側 Drawer：避免窄螢幕（iPad/小視窗）被擠到月曆下方看不到。
          開啟條件 = 有選日期且未開啟 Booking Detail，故兩層 Drawer 不會疊在一起。 */}
      <RightSheet
        open={!!selectedDate && !activeBookingId}
        onClose={closeDay}
        width={520}
        labelledById="day-detail-sheet-title"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-earth-200 px-4 py-3">
          <h2
            id="day-detail-sheet-title"
            className="text-base font-semibold text-earth-900"
          >
            {selectedDate
              ? `${Number(selectedDate.slice(5, 7))}/${Number(
                  selectedDate.slice(8, 10),
                )}（${formatWeekdayZh(selectedDate)}） 當日預約`
              : "當日預約"}
          </h2>
          <button
            type="button"
            onClick={closeDay}
            aria-label="關閉"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-earth-500 hover:bg-earth-100 hover:text-earth-700"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <DayDetailPanel
            date={selectedDate}
            bookings={filteredDayBookings}
            slots={daySlots}
            slotsKnown={slotsKnown}
            slotsLoading={slotsLoadingForSelected}
            daySchedule={
              selectedDate ? (monthSchedule[selectedDate] ?? null) : null
            }
            monthHasAnyBookings={monthData.some(
              (d) => d.totalBookingCount > 0,
            )}
            onBookingClick={openBooking}
            filteredFrom={
              dayBookings.length !== filteredDayBookings.length
                ? dayBookings.length
                : null
            }
            readOnly={readOnly}
            selectedIds={readOnly ? undefined : selectedIds}
            onToggleSelect={readOnly ? undefined : toggleSelect}
            onSelectAllActionable={readOnly ? undefined : selectAllActionable}
            onClearSelection={readOnly ? undefined : clearSelection}
            onCompleteBatch={readOnly ? undefined : completeBatch}
            onCompleteSingle={readOnly ? undefined : completeSingle}
            actingIds={readOnly ? undefined : actingIds}
            batchActing={readOnly ? false : batchActing}
          />
        </div>
      </RightSheet>

      <BookingDetailDrawer
        open={!!activeBookingId}
        bookingId={activeBookingId}
        summary={activeSummary}
        prefill={activePrefill}
        cache={detailCache}
        onClose={closeBooking}
        onUpdated={handleBookingUpdated}
        readOnly={readOnly}
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

// Richer prefill from the same in-memory BookingEntry — covers the drawer's
// basic body sections (預約資訊 / 顧客 / 金額提示) with zero extra query.
function monthEntryToPrefill(b: BookingEntry, date: string): BookingPrefill {
  return {
    id: b.id,
    bookingDate: date,
    slotTime: b.slotTime,
    bookingStatus: b.bookingStatus,
    bookingType: b.bookingType,
    isMakeup: b.isMakeup,
    isCheckedIn: b.isCheckedIn,
    people: b.people,
    attendedPeople: b.attendedPeople,
    customerName: b.customer.name,
    customerPhone: b.customer.phone,
    revenueStaff: b.revenueStaff
      ? {
          displayName: b.revenueStaff.displayName,
          colorCode: b.revenueStaff.colorCode,
        }
      : null,
    serviceStaffName: b.serviceStaff?.displayName ?? null,
    servicePlanName:
      b.servicePlan?.name ?? b.customerPlanWallet?.plan.name ?? null,
    serviceNote: b.customer.serviceNote,
    collected: b.collected,
    collectedAmount: b.collectedAmount,
    expectedAmount: b.expectedAmount,
    trialDefaultPrice: b.trialDefaultPrice,
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
