"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  DashboardLink as Link,
  resolveDashboardHref,
} from "@/components/dashboard-link";
import {
  formatDateWithWeekdayZh,
  parseLocalDate,
  toDateInputValue,
} from "@/lib/date-utils";
import { addMinutes } from "@/lib/spa-scheduling";
import {
  inferSpaDemoResourceType,
  spaResourceLabel,
} from "@/lib/spa-demo-catalog";
import {
  resolveSpaProviderBadge,
  resolveSpaScheduleService,
} from "@/lib/spa-dashboard-schedule";
import {
  BookingDetailDrawer,
  type BookingPrefill,
  type BookingSummary,
} from "./booking-detail-drawer";
import { createBookingDetailCache } from "./booking-detail-cache";
import {
  SpaQuickBookingDrawer,
  type SpaQuickTarget,
  type SpaQuickTreatment,
} from "./spa-quick-booking-drawer";

const SCHEDULE_START_MINUTES = 10 * 60;
const SCHEDULE_END_MINUTES = 21 * 60;
const DEFAULT_ROW_MINUTES = 30;

export interface SpaScheduleProvider {
  id: string;
  displayName: string;
  colorCode: string;
  shiftLabel: string;
  nextAvailableTime: string | null;
}

export interface SpaScheduleBooking {
  id: string;
  slotTime: string;
  bookingStatus: string;
  isMakeup: boolean;
  isCheckedIn: boolean;
  people: number;
  attendedPeople: number | null;
  bookingType: string;
  expectedAmount: number | null;
  trialDefaultPrice: number | null;
  treatmentNameSnapshot: string | null;
  treatmentServiceMinutesSnapshot: number | null;
  treatmentBufferMinutesSnapshot: number | null;
  collected: boolean;
  collectedAmount: number | null;
  customerName: string;
  customer: {
    id: string;
    name: string;
    phone: string;
    serviceNote: string | null;
  };
  revenueStaff: {
    id: string;
    displayName: string;
    colorCode: string;
  } | null;
  serviceStaff: { id: string; displayName: string } | null;
  servicePlan: { name: string } | null;
  customerPlanWallet: { plan: { name: string } } | null;
}

export function SpaProviderSchedule({
  date,
  providers,
  bookableStartTimes,
  providerBookableStartTimes,
  timeUnitMinutes = DEFAULT_ROW_MINUTES,
  treatments,
  initialBookings,
  readOnly = false,
}: {
  date: string;
  providers: readonly SpaScheduleProvider[];
  bookableStartTimes: readonly string[];
  providerBookableStartTimes?: Readonly<Record<string, readonly string[]>>;
  timeUnitMinutes?: 15 | 30;
  treatments: readonly SpaQuickTreatment[];
  initialBookings: readonly SpaScheduleBooking[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [bookings, setBookings] = useState(() => [...initialBookings]);
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);
  const [quickTarget, setQuickTarget] = useState<SpaQuickTarget | null>(null);
  const [detailCache] = useState(() => createBookingDetailCache());
  const scheduleScrollRef = useRef<HTMLDivElement>(null);
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);
  const [rowMinutes, setRowMinutes] = useState<15 | 30>(
    timeUnitMinutes === 15 ? 15 : DEFAULT_ROW_MINUTES,
  );
  const rowHeight = rowMinutes === 15 ? 36 : 48;
  const scheduleTimes = useMemo(
    () =>
      Array.from(
        {
          length: (SCHEDULE_END_MINUTES - SCHEDULE_START_MINUTES) / rowMinutes,
        },
        (_, index) =>
          minutesToTime(SCHEDULE_START_MINUTES + index * rowMinutes),
      ),
    [rowMinutes],
  );

  const bookingById = useMemo(
    () => new Map(bookings.map((booking) => [booking.id, booking])),
    [bookings],
  );
  const activeBooking = activeBookingId
    ? (bookingById.get(activeBookingId) ?? null)
    : null;
  const todayDate = nowMinutes == null ? date : toDateInputValue(new Date());
  const isToday = nowMinutes != null && date === todayDate;
  const completedCount = bookings.filter(
    (booking) => booking.bookingStatus === "COMPLETED" && booking.collected,
  ).length;
  const unsettledCount = bookings.filter(
    (booking) => booking.bookingStatus === "COMPLETED" && !booking.collected,
  ).length;
  const occupiedResources = isToday
    ? bookings.reduce(
        (counts, booking) => {
          const start = timeToMinutes(booking.slotTime);
          const end = start + durationForBooking(booking);
          if (
            booking.bookingStatus !== "CANCELLED" &&
            nowMinutes >= start &&
            nowMinutes < end
          ) {
            const type = inferSpaDemoResourceType({
              treatmentName: booking.treatmentNameSnapshot,
            });
            counts[type] += 1;
          }
          return counts;
        },
        { BED: 0, CHAIR: 0 },
      )
    : { BED: 0, CHAIR: 0 };

  useEffect(() => {
    function syncClock() {
      const now = new Date();
      setNowMinutes(now.getHours() * 60 + now.getMinutes());
    }
    syncClock();
    const timer = window.setInterval(syncClock, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isToday) return;
    const now = new Date();
    scrollToMinutes(
      scheduleScrollRef.current,
      now.getHours() * 60 + now.getMinutes(),
      rowMinutes,
      rowHeight,
    );
  }, [date, isToday, rowHeight, rowMinutes]);

  function handleUpdated(bookingId: string, newStatus: string | null) {
    detailCache.invalidate(bookingId);
    if (!newStatus) {
      router.refresh();
      return;
    }
    setBookings((current) =>
      current.map((booking) =>
        booking.id === bookingId
          ? {
              ...booking,
              bookingStatus: newStatus,
              isCheckedIn:
                newStatus === "COMPLETED" ? true : booking.isCheckedIn,
            }
          : booking,
      ),
    );
  }

  function handleIntervalChange(interval: 15 | 30) {
    if (interval === rowMinutes) return;
    setRowMinutes(interval);
  }

  function handleBackToNow() {
    if (nowMinutes == null) return;
    scrollToMinutes(
      scheduleScrollRef.current,
      nowMinutes,
      rowMinutes,
      rowHeight,
    );
  }

  function handleDateChange(nextDate: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate) || nextDate === date) return;
    router.push(
      resolveDashboardHref(
        `/dashboard/spa-schedule?date=${nextDate}`,
        pathname,
      ),
    );
  }

  function openFirstAvailableSlot() {
    if (readOnly || date < todayDate) return;
    for (const time of scheduleTimes) {
      const provider = providers.find((item) =>
        (providerBookableStartTimes?.[item.id] ?? bookableStartTimes).includes(
          time,
        ),
      );
      if (provider) {
        setQuickTarget({ providerId: provider.id, time });
        return;
      }
    }
  }

  const bookingGroups = new Set(
    bookings.map((booking) => `${booking.slotTime}|${booking.customer.id}`),
  ).size;
  const paidAmount = bookings.reduce(
    (total, booking) => total + (booking.collectedAmount ?? 0),
    0,
  );
  const activeCount = bookings.filter((booking) =>
    ["PENDING", "CONFIRMED"].includes(booking.bookingStatus),
  ).length;
  const isHistory = date < todayDate;

  return (
    <div className="min-w-0 space-y-6 pb-8">
      <header className="border-b border-earth-200/80 pb-6">
        <span className="rounded-full bg-primary-100 px-2.5 py-1 text-xs font-semibold text-primary-700">
          SPA 人員排程
        </span>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-earth-900 sm:text-3xl">
          {isHistory ? "歷史營運" : "今日營運"}
        </h1>
      </header>

      <div className="flex flex-col gap-3 rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-800 sm:flex-row sm:items-center sm:justify-between">
        <p>
          {providers.length
            ? "預約、服務進度與當日收款皆使用目前登入店家的資料。"
            : "目前店家尚未建立可接客的芳療師，請先到人員管理完成設定。"}
        </p>
        {!readOnly && providers.length ? (
          <button
            type="button"
            onClick={openFirstAvailableSlot}
            disabled={isHistory}
            className="min-h-10 shrink-0 rounded-xl bg-earth-900 px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            ＋ 現場快速預約
          </button>
        ) : !readOnly ? (
          <Link
            href="/dashboard/staff"
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-earth-900 px-4 font-semibold text-white"
          >
            前往人員管理
          </Link>
        ) : null}
      </div>

      <section
        className="grid grid-cols-2 gap-3 xl:grid-cols-4"
        aria-label="當日營運摘要"
      >
        <OverviewMetric
          label="預約人次"
          value={String(bookings.length)}
          unit="位"
          detail={`${bookingGroups} 組預約`}
        />
        <OverviewMetric
          label="已完成"
          value={String(completedCount)}
          unit="位"
          detail="服務完成即列入"
        />
        <OverviewMetric
          label="當日實收"
          value={`NT$${paidAmount.toLocaleString()}`}
          detail="依完成付款紀錄計算"
          emphasized
        />
        <OverviewMetric
          label={isHistory ? "待補登" : "待服務"}
          value={String(activeCount)}
          unit="位"
          detail={
            activeCount
              ? isHistory
                ? "請補登完成、未到或取消"
                : "點預約即可查看與處理"
              : "當日服務已完成"
          }
        />
      </section>

      <DailyOperations
        bookings={bookings}
        date={date}
        paidAmount={paidAmount}
      />

      <section className="flex min-h-[620px] flex-col overflow-hidden rounded-2xl border border-earth-200 bg-white shadow-[0_8px_28px_rgba(74,66,53,0.06)]">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-earth-200 px-4 py-2.5">
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-primary-700">
              時間 × 芳療師
            </p>
            <h2 className="text-sm font-semibold text-earth-900">
              {formatDateWithWeekdayZh(date)}
            </h2>
          </div>
          <div className="flex flex-1 flex-wrap gap-1.5">
            {unsettledCount > 0 ? (
              <Metric
                tone="warning"
                label="待收費"
                value={`${unsettledCount} 筆`}
              />
            ) : null}
            <Metric
              label="按摩床可用"
              value={`${Math.max(0, 2 - occupiedResources.BED)}/2`}
            />
            <Metric
              label="沙發椅可用"
              value={`${Math.max(0, 2 - occupiedResources.CHAIR)}/2`}
            />
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Link
              href={`/dashboard/spa-schedule?date=${shiftDate(date, -1)}`}
              aria-label="前一天"
              className="inline-flex h-8 items-center rounded-md border border-earth-300 bg-white px-2.5 text-xs font-medium text-earth-700 hover:bg-earth-50"
            >
              ←
            </Link>
            <label className="relative">
              <span className="sr-only">選擇預約日期</span>
              <input
                type="date"
                value={date}
                onChange={(event) => handleDateChange(event.target.value)}
                aria-label="選擇預約日期"
                className="h-8 rounded-md border border-earth-300 bg-white px-2.5 text-xs font-semibold tabular-nums text-earth-800 outline-none hover:bg-earth-50 focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              />
            </label>
            <Link
              href={`/dashboard/spa-schedule?date=${todayDate}`}
              className="inline-flex h-8 items-center rounded-md border border-earth-300 bg-white px-3 text-xs font-semibold text-earth-700 hover:bg-earth-50"
            >
              今天
            </Link>
            <Link
              href={`/dashboard/spa-schedule?date=${shiftDate(date, 1)}`}
              aria-label="後一天"
              className="inline-flex h-8 items-center rounded-md border border-earth-300 bg-white px-2.5 text-xs font-medium text-earth-700 hover:bg-earth-50"
            >
              →
            </Link>
            {isToday ? (
              <button
                type="button"
                onClick={handleBackToNow}
                className="inline-flex h-8 items-center rounded-md border border-primary-200 bg-primary-50 px-3 text-xs font-semibold text-primary-700 hover:bg-primary-100"
              >
                回到現在
              </button>
            ) : null}
            {!readOnly ? (
              <div
                className="inline-flex rounded-lg border border-earth-200 bg-earth-50 p-0.5"
                aria-label="切換預約時間單位"
              >
                {([15, 30] as const).map((interval) => (
                  <button
                    key={interval}
                    type="button"
                    onClick={() => handleIntervalChange(interval)}
                    aria-pressed={rowMinutes === interval}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                      rowMinutes === interval
                        ? "bg-white text-primary-700 shadow-sm ring-1 ring-earth-200"
                        : "text-earth-500 hover:text-earth-800"
                    }`}
                  >
                    {interval} 分
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {providers.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
            <p className="text-base font-semibold text-earth-800">
              尚未建立可排程的芳療師
            </p>
            <p className="mt-2 max-w-md text-sm text-earth-500">
              新增人員後，設定專業項目與固定班表，這裡就會自動出現芳療師欄位。
            </p>
            {!readOnly ? (
              <Link
                href="/dashboard/staff"
                className="mt-4 rounded-xl border border-primary-300 bg-primary-50 px-4 py-2.5 text-sm font-semibold text-primary-800"
              >
                設定第一位芳療師
              </Link>
            ) : null}
          </div>
        ) : (
          <div
            ref={scheduleScrollRef}
            className="min-h-[460px] flex-1 overflow-auto"
          >
            <div
              className="w-full"
              style={{ minWidth: `${80 + providers.length * 240}px` }}
            >
              <div
                className="sticky top-0 z-30 grid border-b border-earth-200 bg-earth-50 shadow-sm"
                style={{
                  gridTemplateColumns: `80px repeat(${providers.length}, minmax(240px, 1fr))`,
                }}
              >
                <div className="sticky left-0 z-40 border-r border-earth-200 bg-earth-50 px-3 py-3 text-xs font-semibold text-earth-500">
                  時間
                </div>
                {providers.map((provider) => (
                  <ProviderHeader key={provider.id} provider={provider} />
                ))}
              </div>

              <div
                className="relative grid"
                style={{
                  gridTemplateColumns: `80px repeat(${providers.length}, minmax(240px, 1fr))`,
                }}
              >
                {isToday && nowMinutes != null ? (
                  <NowLine
                    nowMinutes={nowMinutes}
                    rowMinutes={rowMinutes}
                    rowHeight={rowHeight}
                  />
                ) : null}
                <div
                  className="sticky left-0 z-20 grid border-r border-earth-200 bg-white"
                  style={{
                    gridTemplateRows: `repeat(${scheduleTimes.length}, ${rowHeight}px)`,
                  }}
                >
                  {scheduleTimes.map((time) => (
                    <div
                      key={time}
                      className="border-b border-earth-100 px-3 py-2 text-xs font-medium tabular-nums text-earth-500"
                    >
                      {time}
                    </div>
                  ))}
                </div>

                {providers.map((provider) => (
                  <ProviderColumn
                    key={provider.id}
                    provider={provider}
                    bookableStartTimes={
                      providerBookableStartTimes?.[provider.id] ??
                      bookableStartTimes
                    }
                    bookings={bookings.filter(
                      (booking) =>
                        providerIdForBooking(booking) === provider.id,
                    )}
                    onOpen={setActiveBookingId}
                    onCreate={(time) =>
                      setQuickTarget({ providerId: provider.id, time })
                    }
                    readOnly={readOnly}
                    scheduleTimes={scheduleTimes}
                    rowMinutes={rowMinutes}
                    rowHeight={rowHeight}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <BookingDetailDrawer
        open={!!activeBooking}
        bookingId={activeBooking?.id ?? null}
        summary={activeBooking ? toSummary(activeBooking, date) : null}
        prefill={activeBooking ? toPrefill(activeBooking, date) : null}
        cache={detailCache}
        onClose={() => setActiveBookingId(null)}
        onUpdated={handleUpdated}
        readOnly={readOnly}
        durationMinutes={
          activeBooking ? durationForBooking(activeBooking) : undefined
        }
        spaMode
      />
      {quickTarget ? (
        <SpaQuickBookingDrawer
          key={`${quickTarget.providerId}-${quickTarget.time}`}
          date={date}
          target={quickTarget}
          providers={providers}
          treatments={treatments}
          onClose={() => setQuickTarget(null)}
          onCreated={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}

function OverviewMetric({
  label,
  value,
  unit,
  detail,
  emphasized = false,
}: {
  label: string;
  value: string;
  unit?: string;
  detail: string;
  emphasized?: boolean;
}) {
  return (
    <article
      className={`rounded-2xl p-4 shadow-[0_8px_24px_rgba(74,66,53,0.05)] ring-1 ring-earth-200/70 sm:p-5 ${emphasized ? "bg-primary-50" : "bg-white"}`}
    >
      <p className="text-xs font-medium text-earth-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-earth-900 sm:text-3xl">
        {value}
        {unit ? (
          <span className="ml-1 text-sm font-medium text-earth-500">
            {unit}
          </span>
        ) : null}
      </p>
      <p className="mt-2 text-xs text-earth-500">{detail}</p>
    </article>
  );
}

function DailyOperations({
  bookings,
  date,
  paidAmount,
}: {
  bookings: readonly SpaScheduleBooking[];
  date: string;
  paidAmount: number;
}) {
  const rows = [...bookings].sort((left, right) =>
    left.slotTime.localeCompare(right.slotTime),
  );
  return (
    <section
      className="overflow-hidden rounded-2xl bg-white shadow-[0_8px_28px_rgba(74,66,53,0.06)] ring-1 ring-earth-200/70"
      aria-label="每日營運與帳務總覽"
    >
      <header className="border-b border-earth-100 px-5 py-5">
        <h2 className="text-lg font-semibold text-earth-900">每日營運與帳務</h2>
        <p className="mt-1 text-sm text-earth-500">
          {formatDateWithWeekdayZh(date)}
        </p>
      </header>
      <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,0.7fr)]">
        <div className="border-b border-earth-100 p-5 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">預約與結帳明細</h3>
            <span className="text-sm text-earth-500">{rows.length} 位</span>
          </div>
          {rows.length ? (
            <div className="mt-3 divide-y divide-earth-100">
              {rows.map((booking) => (
                <div
                  key={booking.id}
                  className="flex items-center justify-between gap-4 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-earth-900">
                      {booking.slotTime}・{booking.customerName}
                    </p>
                    <p className="mt-1 truncate text-xs text-earth-500">
                      {booking.treatmentNameSnapshot ??
                        booking.servicePlan?.name ??
                        "SPA 服務"}
                      ・{statusLabel(booking.bookingStatus)}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums text-earth-900">
                    {booking.collectedAmount == null
                      ? "待結帳"
                      : `NT$${booking.collectedAmount.toLocaleString()}`}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-earth-500">
              這一天尚無預約
            </p>
          )}
        </div>
        <div className="p-5">
          <h3 className="font-semibold">當日收款</h3>
          <div className="mt-4 flex items-center justify-between rounded-xl bg-earth-50 px-4 py-4">
            <span className="text-sm text-earth-600">已收款</span>
            <span className="text-lg font-semibold tabular-nums text-earth-900">
              NT${paidAmount.toLocaleString()}
            </span>
          </div>
          <p className="mt-3 text-xs leading-5 text-earth-500">
            僅彙總目前登入店家的成功付款；退款與調整仍以付款明細為準。
          </p>
        </div>
      </div>
    </section>
  );
}

function statusLabel(status: string) {
  if (status === "COMPLETED") return "已完成";
  if (status === "CANCELLED") return "已取消";
  if (status === "CONFIRMED") return "已確認";
  return "待確認";
}

function ProviderHeader({ provider }: { provider: SpaScheduleProvider }) {
  const badge = resolveSpaProviderBadge(provider.displayName);
  const name = provider.displayName.replace(/^\d+號\s*/, "");
  return (
    <div className="border-r border-earth-200 px-4 py-3 last:border-r-0">
      <div className="flex items-center gap-3">
        <span
          className="inline-flex min-w-10 items-center justify-center rounded-md px-2 py-1 text-xs font-bold text-white"
          style={{ backgroundColor: provider.colorCode }}
        >
          {badge}號
        </span>
        <div>
          <p className="text-sm font-semibold text-earth-900">{name}</p>
          <p className="text-[11px] text-earth-500">
            值班 {provider.shiftLabel}
          </p>
          <p className="text-[11px] font-medium text-primary-700">
            {provider.nextAvailableTime
              ? `最快 ${provider.nextAvailableTime} 可接`
              : "今日暫無空檔"}
          </p>
        </div>
      </div>
    </div>
  );
}

function ProviderColumn({
  provider,
  bookableStartTimes,
  bookings,
  onOpen,
  onCreate,
  readOnly,
  scheduleTimes,
  rowMinutes,
  rowHeight,
}: {
  provider: SpaScheduleProvider;
  bookableStartTimes: readonly string[];
  bookings: readonly SpaScheduleBooking[];
  onOpen: (bookingId: string) => void;
  onCreate: (time: string) => void;
  readOnly: boolean;
  scheduleTimes: readonly string[];
  rowMinutes: number;
  rowHeight: number;
}) {
  const enabledTimes = new Set(bookableStartTimes);
  return (
    <div
      className="relative grid border-r border-earth-200 last:border-r-0"
      style={{
        gridTemplateRows: `repeat(${scheduleTimes.length}, ${rowHeight}px)`,
      }}
    >
      {scheduleTimes.map((time, index) => {
        const canCreate = enabledTimes.has(time) && !readOnly;
        return canCreate ? (
          <button
            key={time}
            type="button"
            onClick={() => onCreate(time)}
            aria-label={`${provider.displayName} ${time} 新增預約`}
            className="group flex items-center justify-center border-b border-earth-100 bg-earth-50/20 p-1 text-[11px] font-medium text-earth-300 transition hover:bg-primary-50 hover:text-primary-700 focus-visible:bg-primary-50 focus-visible:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400"
            style={{ gridColumn: 1, gridRow: index + 1 }}
          >
            <span className="rounded px-2 py-1 group-hover:bg-white group-focus-visible:bg-white">
              ＋ {time} 排預約
            </span>
          </button>
        ) : (
          <div
            key={time}
            className="border-b border-earth-100 bg-earth-50/20 p-1"
            style={{ gridColumn: 1, gridRow: index + 1 }}
          />
        );
      })}

      {bookings.map((booking) => {
        const duration = durationForBooking(booking);
        return (
          <button
            key={booking.id}
            type="button"
            onClick={() => onOpen(booking.id)}
            className={`z-10 m-1 flex overflow-hidden rounded-md border px-3 py-2 text-left shadow-sm transition hover:-translate-y-px hover:shadow ${statusClass(booking.bookingStatus)}`}
            style={{
              gridColumn: 1,
              gridRow: `${rowForTime(booking.slotTime, rowMinutes)} / span ${rowsForMinutes(duration, rowMinutes)}`,
            }}
          >
            <span className="flex min-h-0 w-full flex-col justify-start">
              <span className="flex items-start justify-between gap-2">
                <span className="truncate text-sm font-semibold text-earth-900">
                  {booking.customerName}
                </span>
                <span className="shrink-0 rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold">
                  {spaOperationalStatus(booking)}
                </span>
              </span>
              <span className="mt-1 block truncate text-xs text-earth-700">
                {serviceNameForBooking(booking)}
              </span>
              <span className="mt-1 block text-[10px] font-medium tabular-nums text-earth-600">
                {booking.slotTime}–
                {addMinutes(
                  booking.slotTime,
                  serviceMinutesForBooking(booking),
                )}{" "}
                服務・
                {spaResourceLabel(
                  inferSpaDemoResourceType({
                    treatmentName: booking.treatmentNameSnapshot,
                  }),
                )}
              </span>
              {(booking.treatmentBufferMinutesSnapshot ?? 0) > 0 ? (
                <span className="mt-0.5 block text-[10px] tabular-nums text-earth-500">
                  整理至 {addMinutes(booking.slotTime, duration)}
                  ・之後可接下一位
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "quiet",
}: {
  label: string;
  value: string;
  tone?: "quiet" | "notice" | "active" | "warning";
}) {
  const toneClass = {
    quiet: "bg-earth-50 text-earth-900",
    notice: "bg-amber-50 text-amber-900 ring-1 ring-amber-100",
    active: "bg-primary-50 text-primary-900 ring-1 ring-primary-100",
    warning: "bg-rose-50 text-rose-900 ring-1 ring-rose-100",
  }[tone];
  return (
    <div
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 ${toneClass}`}
    >
      <span className="text-[11px] text-earth-500">{label}</span>
      <span className="text-xs font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function NowLine({
  nowMinutes,
  rowMinutes,
  rowHeight,
}: {
  nowMinutes: number;
  rowMinutes: number;
  rowHeight: number;
}) {
  if (
    nowMinutes < SCHEDULE_START_MINUTES ||
    nowMinutes > SCHEDULE_END_MINUTES
  ) {
    return null;
  }
  const top = ((nowMinutes - SCHEDULE_START_MINUTES) / rowMinutes) * rowHeight;
  return (
    <div
      className="pointer-events-none absolute left-0 right-0 z-20 border-t-2 border-rose-500"
      style={{ top }}
      aria-label={`現在時間 ${minutesToTime(nowMinutes)}`}
    >
      <span className="absolute -left-px -top-3 rounded-r bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white">
        現在 {minutesToTime(nowMinutes)}
      </span>
    </div>
  );
}

function toSummary(booking: SpaScheduleBooking, date: string): BookingSummary {
  return {
    id: booking.id,
    bookingDate: date,
    slotTime: booking.slotTime,
    bookingStatus: booking.bookingStatus,
    isMakeup: booking.isMakeup,
    people: booking.people,
    customerName: booking.customerName,
    servicePlanName: serviceNameForBooking(booking),
    servicePlanCategory: booking.bookingType === "FIRST_TRIAL" ? "TRIAL" : null,
  };
}

function toPrefill(booking: SpaScheduleBooking, date: string): BookingPrefill {
  return {
    id: booking.id,
    bookingDate: date,
    slotTime: booking.slotTime,
    bookingStatus: booking.bookingStatus,
    bookingType: booking.bookingType,
    isMakeup: booking.isMakeup,
    isCheckedIn: booking.isCheckedIn,
    people: booking.people,
    attendedPeople: booking.attendedPeople,
    customerName: booking.customer.name,
    customerPhone: booking.customer.phone,
    serviceNote: booking.customer.serviceNote,
    revenueStaff: booking.revenueStaff,
    serviceStaffName: booking.serviceStaff?.displayName ?? null,
    servicePlanName: serviceNameForBooking(booking),
    collected: booking.collected,
    collectedAmount: booking.collectedAmount,
    expectedAmount: booking.expectedAmount,
    trialDefaultPrice: booking.trialDefaultPrice,
  };
}

function providerIdForBooking(booking: SpaScheduleBooking): string | null {
  return booking.serviceStaff?.id ?? booking.revenueStaff?.id ?? null;
}

function serviceNameForBooking(booking: SpaScheduleBooking): string {
  if (booking.treatmentNameSnapshot) return booking.treatmentNameSnapshot;
  return resolveSpaScheduleService({
    bookingId: booking.id,
    servicePlanName: booking.servicePlan?.name,
    walletPlanName: booking.customerPlanWallet?.plan.name,
  }).name;
}

function durationForBooking(booking: SpaScheduleBooking): number {
  if (booking.treatmentServiceMinutesSnapshot != null) {
    return (
      booking.treatmentServiceMinutesSnapshot +
      (booking.treatmentBufferMinutesSnapshot ?? 0)
    );
  }
  return resolveSpaScheduleService({
    bookingId: booking.id,
    servicePlanName: booking.servicePlan?.name,
    walletPlanName: booking.customerPlanWallet?.plan.name,
  }).durationMinutes;
}

function serviceMinutesForBooking(booking: SpaScheduleBooking): number {
  return (
    booking.treatmentServiceMinutesSnapshot ??
    resolveSpaScheduleService({
      bookingId: booking.id,
      servicePlanName: booking.servicePlan?.name,
      walletPlanName: booking.customerPlanWallet?.plan.name,
    }).durationMinutes
  );
}

function statusClass(status: string): string {
  if (status === "COMPLETED")
    return "border-earth-200 bg-earth-100 text-earth-500";
  if (status === "NO_SHOW") return "border-red-200 bg-red-50 text-red-700";
  if (status === "PENDING")
    return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-primary-200 bg-primary-50 text-primary-800";
}

function spaOperationalStatus(booking: SpaScheduleBooking): string {
  if (booking.bookingStatus === "COMPLETED") {
    return booking.collected ? "已完成" : "待收費";
  }
  if (booking.bookingStatus === "CANCELLED") return "已取消";
  if (booking.bookingStatus === "NO_SHOW") return "未到";
  return "待服務";
}

function timeToMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function scrollToMinutes(
  container: HTMLDivElement | null,
  minutes: number,
  rowMinutes: number,
  rowHeight: number,
) {
  if (!container) return;
  const offset = ((minutes - SCHEDULE_START_MINUTES) / rowMinutes) * rowHeight;
  container.scrollTo({
    top: Math.max(0, offset - Math.min(180, container.clientHeight / 3)),
    behavior: "smooth",
  });
}

function rowForTime(time: string, rowMinutes: number): number {
  const [hour, minute] = time.split(":").map(Number);
  return Math.max(
    1,
    Math.floor((hour * 60 + minute - SCHEDULE_START_MINUTES) / rowMinutes) + 1,
  );
}

function rowsForMinutes(minutes: number, rowMinutes: number): number {
  return Math.max(1, Math.ceil(minutes / rowMinutes));
}

function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function shiftDate(date: string, days: number): string {
  const parsed = parseLocalDate(date);
  parsed.setDate(parsed.getDate() + days);
  return toDateInputValue(parsed);
}
