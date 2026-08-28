"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { STATUS_LABEL } from "@/lib/booking-constants";
import { formatDateWithWeekdayZh, parseLocalDate, toDateInputValue } from "@/lib/date-utils";
import { addMinutes } from "@/lib/spa-scheduling";
import {
  resolveSpaProviderBadge,
  resolveSpaScheduleService,
} from "@/lib/spa-dashboard-schedule";
import {
  BookingDetailDrawer,
  type BookingPrefill,
  type BookingSummary,
} from "./booking-detail-drawer";
import {
  createBookingDetailCache,
} from "./booking-detail-cache";

const SCHEDULE_START_MINUTES = 10 * 60;
const SCHEDULE_END_MINUTES = 21 * 60;
const ROW_MINUTES = 30;
const ROW_HEIGHT = 48;

const scheduleTimes = Array.from(
  { length: (SCHEDULE_END_MINUTES - SCHEDULE_START_MINUTES) / ROW_MINUTES },
  (_, index) => minutesToTime(SCHEDULE_START_MINUTES + index * ROW_MINUTES),
);

export interface SpaScheduleProvider {
  id: string;
  displayName: string;
  colorCode: string;
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
  initialBookings,
  readOnly = false,
}: {
  date: string;
  providers: readonly SpaScheduleProvider[];
  bookableStartTimes: readonly string[];
  providerBookableStartTimes?: Readonly<Record<string, readonly string[]>>;
  initialBookings: readonly SpaScheduleBooking[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [bookings, setBookings] = useState(() => [...initialBookings]);
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);
  const [detailCache] = useState(() => createBookingDetailCache());

  const bookingById = useMemo(
    () => new Map(bookings.map((booking) => [booking.id, booking])),
    [bookings],
  );
  const activeBooking = activeBookingId ? bookingById.get(activeBookingId) ?? null : null;
  const activeProviderCount = new Set(
    bookings.map((booking) => providerIdForBooking(booking)).filter(Boolean),
  ).size;
  const pendingCount = bookings.filter(
    (booking) => booking.bookingStatus === "PENDING" || booking.bookingStatus === "CONFIRMED",
  ).length;

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
              isCheckedIn: newStatus === "COMPLETED" ? true : booking.isCheckedIn,
            }
          : booking,
      ),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-earth-200 bg-white px-4 py-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-primary-700">SPA 芳療師排程</p>
          <p className="mt-1 text-sm font-semibold text-earth-900">
            {formatDateWithWeekdayZh(date)}
          </p>
          <p className="mt-0.5 text-xs text-earth-500">以人員時間為主，不使用月曆格管理容量</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/bookings?date=${shiftDate(date, -1)}`}
            className="inline-flex h-9 items-center rounded-md border border-earth-300 bg-white px-3 text-xs font-medium text-earth-700 hover:bg-earth-50"
          >
            ← 前一天
          </Link>
          <Link
            href={`/dashboard/bookings?date=${shiftDate(date, 1)}`}
            className="inline-flex h-9 items-center rounded-md border border-earth-300 bg-white px-3 text-xs font-medium text-earth-700 hover:bg-earth-50"
          >
            後一天 →
          </Link>
        </div>
      </div>

      <section className="overflow-hidden rounded-lg border border-earth-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-earth-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-earth-900">時間 × 芳療師</h2>
            <p className="mt-0.5 text-xs text-earth-500">
              點空白時段新增預約；點預約可完成服務、扣療程、收款、取消或改期
            </p>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="當日 SPA 營運摘要">
            <Metric label="預約" value={`${bookings.length} 筆`} />
            <Metric label="待服務" value={`${pendingCount} 筆`} />
            <Metric label="已排人員" value={`${activeProviderCount}/${providers.length}`} />
          </div>
        </div>

        {providers.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-earth-500">
            尚未建立可排程的芳療師
          </div>
        ) : (
          <div className="max-h-[calc(100vh-330px)] min-h-[460px] overflow-auto">
            <div
              className="min-w-max"
              style={{ width: `${80 + providers.length * 240}px` }}
            >
              <div
                className="sticky top-0 z-30 grid border-b border-earth-200 bg-earth-50 shadow-sm"
                style={{ gridTemplateColumns: `80px repeat(${providers.length}, minmax(240px, 1fr))` }}
              >
                <div className="sticky left-0 z-40 border-r border-earth-200 bg-earth-50 px-3 py-3 text-xs font-semibold text-earth-500">
                  時間
                </div>
                {providers.map((provider) => (
                  <ProviderHeader key={provider.id} provider={provider} />
                ))}
              </div>

              <div
                className="grid"
                style={{ gridTemplateColumns: `80px repeat(${providers.length}, minmax(240px, 1fr))` }}
              >
                <div
                  className="sticky left-0 z-20 grid border-r border-earth-200 bg-white"
                  style={{ gridTemplateRows: `repeat(${scheduleTimes.length}, ${ROW_HEIGHT}px)` }}
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
                    date={date}
                    provider={provider}
                    bookableStartTimes={providerBookableStartTimes?.[provider.id] ?? bookableStartTimes}
                    bookings={bookings.filter(
                      (booking) => providerIdForBooking(booking) === provider.id,
                    )}
                    onOpen={setActiveBookingId}
                    readOnly={readOnly}
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
        rebookHref={
          activeBooking
            ? `/dashboard/bookings/new?customerId=${encodeURIComponent(activeBooking.customer.id)}`
            : undefined
        }
        durationMinutes={activeBooking ? durationForBooking(activeBooking) : undefined}
      />
    </div>
  );
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
          <p className="text-[11px] text-earth-500">芳療師</p>
        </div>
      </div>
    </div>
  );
}

function ProviderColumn({
  date,
  provider,
  bookableStartTimes,
  bookings,
  onOpen,
  readOnly,
}: {
  date: string;
  provider: SpaScheduleProvider;
  bookableStartTimes: readonly string[];
  bookings: readonly SpaScheduleBooking[];
  onOpen: (bookingId: string) => void;
  readOnly: boolean;
}) {
  const enabledTimes = new Set(bookableStartTimes);
  return (
    <div
      className="relative grid border-r border-earth-200 last:border-r-0"
      style={{ gridTemplateRows: `repeat(${scheduleTimes.length}, ${ROW_HEIGHT}px)` }}
    >
      {scheduleTimes.map((time, index) => {
        const canCreate = enabledTimes.has(time) && !readOnly;
        return canCreate ? (
          <Link
            key={time}
            href={`/dashboard/bookings/new?date=${encodeURIComponent(date)}&slotTime=${encodeURIComponent(time)}&serviceStaffId=${encodeURIComponent(provider.id)}`}
            prefetch={false}
            aria-label={`${provider.displayName} ${time} 新增預約`}
            className="group flex items-center justify-center border-b border-earth-100 bg-earth-50/20 p-1 text-[11px] font-medium text-transparent transition hover:bg-primary-50 hover:text-primary-700 focus-visible:bg-primary-50 focus-visible:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400"
            style={{ gridColumn: 1, gridRow: index + 1 }}
          >
            <span className="rounded px-2 py-1 group-hover:bg-white group-focus-visible:bg-white">
              ＋ 安排
            </span>
          </Link>
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
            className={`z-10 m-1 overflow-hidden rounded-md border px-3 py-2 text-left shadow-sm transition hover:-translate-y-px hover:shadow ${statusClass(booking.bookingStatus)}`}
            style={{
              gridColumn: 1,
              gridRow: `${rowForTime(booking.slotTime)} / span ${rowsForMinutes(duration)}`,
            }}
          >
            <span className="flex items-start justify-between gap-2">
              <span className="truncate text-sm font-semibold text-earth-900">
                {booking.customerName}
              </span>
              <span className="shrink-0 text-[10px] font-semibold">
                {STATUS_LABEL[booking.bookingStatus] ?? booking.bookingStatus}
              </span>
            </span>
            <span className="mt-1 block truncate text-xs text-earth-700">
              {serviceNameForBooking(booking)}
            </span>
            <span className="mt-1 block text-[10px] font-medium tabular-nums text-earth-600">
              {booking.slotTime}–{addMinutes(booking.slotTime, duration)}・{duration} 分
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md bg-earth-50 px-2.5 py-1.5">
      <span className="text-[11px] text-earth-500">{label}</span>
      <span className="text-xs font-semibold tabular-nums text-earth-900">{value}</span>
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
  return resolveSpaScheduleService({
    bookingId: booking.id,
    servicePlanName: booking.servicePlan?.name,
    walletPlanName: booking.customerPlanWallet?.plan.name,
  }).name;
}

function durationForBooking(booking: SpaScheduleBooking): number {
  return resolveSpaScheduleService({
    bookingId: booking.id,
    servicePlanName: booking.servicePlan?.name,
    walletPlanName: booking.customerPlanWallet?.plan.name,
  }).durationMinutes;
}

function statusClass(status: string): string {
  if (status === "COMPLETED") return "border-earth-200 bg-earth-100 text-earth-500";
  if (status === "NO_SHOW") return "border-red-200 bg-red-50 text-red-700";
  if (status === "PENDING") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-primary-200 bg-primary-50 text-primary-800";
}

function rowForTime(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return Math.max(1, Math.floor((hour * 60 + minute - SCHEDULE_START_MINUTES) / ROW_MINUTES) + 1);
}

function rowsForMinutes(minutes: number): number {
  return Math.max(1, Math.ceil(minutes / ROW_MINUTES));
}

function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function shiftDate(date: string, days: number): string {
  const parsed = parseLocalDate(date);
  parsed.setDate(parsed.getDate() + days);
  return toDateInputValue(parsed);
}
