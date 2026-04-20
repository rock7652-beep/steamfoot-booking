"use client";

import { DashboardLink as Link } from "@/components/dashboard-link";
import { StatusBadge, bookingStatusMeta } from "@/components/admin/status-badge";
import { EmptyStateCompact } from "@/components/admin/empty-state-compact";
import type { SlotAvailability } from "@/types";

export interface DayBooking {
  id: string;
  slotTime: string;
  people: number;
  isMakeup: boolean;
  isCheckedIn: boolean;
  bookingStatus: string;
  customer: {
    name: string;
    phone: string;
    assignedStaff?: { displayName: string; colorCode: string } | null;
  };
  revenueStaff: { id: string; displayName: string; colorCode: string } | null;
  serviceStaff: { id: string; displayName: string } | null;
  servicePlan: { name: string } | null;
}

interface DayDetailPanelProps {
  date: string | null;
  bookings: DayBooking[];
  slots: SlotAvailability[];
  loading: boolean;
  /** 若有篩選，原始筆數（>0 代表已套篩選） */
  filteredFrom?: number | null;
  /** 點 timeline row 時觸發（取代原本 link 到詳情頁） */
  onBookingClick?: (bookingId: string) => void;
}

export function DayDetailPanel({
  date,
  bookings,
  slots,
  loading,
  filteredFrom = null,
  onBookingClick,
}: DayDetailPanelProps) {
  if (!date) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-earth-200 bg-white p-4">
          <EmptyStateCompact
            title="點選日期以查看詳情"
            hint="左側月曆點任一天會在此顯示當日預約"
            size="section"
          />
        </div>
      </div>
    );
  }

  const dateObj = new Date(date + "T00:00:00+08:00");
  const weekdayLabel = dateObj.toLocaleDateString("zh-TW", {
    weekday: "long",
    timeZone: "Asia/Taipei",
  });
  const monthDay = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;

  const stats = computeStats(bookings);

  return (
    <div className="flex flex-col gap-4">
      {/* Day Header */}
      <div className="rounded-lg border border-earth-200 bg-white p-4">
        <p className="text-lg font-bold text-earth-900">
          {monthDay} {weekdayLabel}
        </p>
        <p className="mt-0.5 text-xs text-earth-500">
          今日 {stats.total} 預約 · {stats.checkedIn} 已到店
          {filteredFrom != null && (
            <span className="ml-2 inline-flex h-[18px] items-center rounded bg-primary-50 px-1.5 text-[11px] font-semibold text-primary-700">
              篩選中 {stats.total}/{filteredFrom}
            </span>
          )}
        </p>
      </div>

      {/* Mini KPIs */}
      <div className="rounded-lg border border-earth-200 bg-white p-4">
        <div className="grid grid-cols-3 gap-3">
          <MiniKpi label="預約" value={stats.total} />
          <MiniKpi label="到店" value={stats.checkedIn} />
          <MiniKpi label="完成" value={stats.completed} />
          <MiniKpi label="未到" value={stats.noShow} tone={stats.noShow > 0 ? "danger" : "default"} />
          <MiniKpi label="人數" value={stats.people} />
          <MiniKpi
            label="補課"
            value={stats.makeup}
            tone={stats.makeup > 0 ? "warning" : "default"}
          />
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 rounded-lg border border-earth-200 bg-white">
        <div className="flex items-center justify-between border-b border-earth-200 px-4 py-3">
          <h3 className="text-base font-semibold text-earth-900">今日預約</h3>
          <Link
            href={`/dashboard/bookings/new?date=${date}`}
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            ＋ 新增
          </Link>
        </div>

        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded bg-earth-50" />
            ))}
          </div>
        ) : bookings.length === 0 ? (
          <div className="p-4">
            <EmptyStateCompact
              title={
                filteredFrom != null && filteredFrom > 0
                  ? "沒有符合篩選的預約"
                  : "該日無預約"
              }
              hint={
                filteredFrom != null && filteredFrom > 0
                  ? `原有 ${filteredFrom} 筆被目前篩選排除`
                  : slots.length === 0
                    ? "該日不營業"
                    : "點上方 ＋ 新增一筆"
              }
              cta={
                slots.length > 0 &&
                !(filteredFrom != null && filteredFrom > 0) && (
                  <Link
                    href={`/dashboard/bookings/new?date=${date}`}
                    className="inline-flex h-8 items-center rounded-md bg-primary-600 px-3 text-sm font-medium text-white hover:bg-primary-700"
                  >
                    ＋ 新增預約於 {monthDay}
                  </Link>
                )
              }
            />
          </div>
        ) : (
          <ul className="max-h-[520px] overflow-y-auto divide-y divide-earth-100">
            {bookings.map((b) => (
              <li key={b.id}>
                <TimelineItem booking={b} onClick={onBookingClick} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Quick Actions */}
      <div className="rounded-lg border border-earth-200 bg-white p-3">
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/dashboard/bookings/new?date=${date}`}
            className="inline-flex h-8 items-center rounded-md bg-primary-600 px-3 text-sm font-semibold text-white hover:bg-primary-700"
          >
            ＋ 新增預約於 {monthDay}
          </Link>
          <Link
            href={`/dashboard/bookings/new?date=${date}`}
            className="inline-flex h-8 items-center rounded-md border border-earth-300 bg-white px-3 text-sm font-medium text-earth-700 hover:bg-earth-50"
          >
            新增補課
          </Link>
        </div>
      </div>
    </div>
  );
}

function TimelineItem({
  booking,
  onClick,
}: {
  booking: DayBooking;
  onClick?: (id: string) => void;
}) {
  const meta = bookingStatusMeta(booking.bookingStatus, booking.isCheckedIn);
  const borderColor =
    meta.variant === "success"
      ? "border-l-green-500"
      : meta.variant === "danger"
        ? "border-l-red-500"
        : meta.variant === "warning"
          ? "border-l-amber-500"
          : meta.variant === "info"
            ? "border-l-blue-500"
            : "border-l-earth-300";

  const staffName =
    booking.revenueStaff?.displayName ??
    booking.serviceStaff?.displayName ??
    booking.customer?.assignedStaff?.displayName ??
    "未指派";

  const cls = `flex w-full items-start gap-3 border-l-[3px] bg-white px-3 py-2.5 text-left transition-colors hover:bg-earth-50 ${borderColor}`;

  const body = (
    <>
      <div className="flex w-14 shrink-0 flex-col items-start">
        <span className="text-sm font-bold tabular-nums text-earth-900">
          {booking.slotTime}
        </span>
        {booking.people > 1 && (
          <span className="text-[11px] text-earth-400">×{booking.people}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-earth-900">
            {booking.customer?.name ?? "—"}
          </span>
          <StatusBadge variant={meta.variant} dot={false}>
            {meta.label}
          </StatusBadge>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-earth-500">
          <span className="truncate">
            {booking.servicePlan?.name ?? (booking.isMakeup ? "補課" : "—")}
          </span>
          <span className="shrink-0">{staffName}</span>
        </div>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={() => onClick(booking.id)} className={cls}>
        {body}
      </button>
    );
  }
  return (
    <Link href={`/dashboard/bookings/${booking.id}`} className={cls}>
      {body}
    </Link>
  );
}

function MiniKpi({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "danger" | "warning";
}) {
  const valueColor =
    tone === "danger"
      ? "text-red-600"
      : tone === "warning"
        ? "text-amber-600"
        : "text-earth-900";
  return (
    <div className="rounded-md bg-earth-50 px-2 py-1.5">
      <p className="text-[11px] text-earth-500">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${valueColor}`}>{value}</p>
    </div>
  );
}

function computeStats(bookings: DayBooking[]) {
  const stats = {
    total: bookings.length,
    people: 0,
    checkedIn: 0,
    completed: 0,
    noShow: 0,
    makeup: 0,
  };
  for (const b of bookings) {
    stats.people += b.people;
    if (b.isCheckedIn) stats.checkedIn++;
    if (b.bookingStatus === "COMPLETED") stats.completed++;
    if (b.bookingStatus === "NO_SHOW") stats.noShow++;
    if (b.isMakeup) stats.makeup++;
  }
  return stats;
}
