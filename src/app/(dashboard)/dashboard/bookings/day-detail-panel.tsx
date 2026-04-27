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

/** Statuses that can still be moved to COMPLETED — defines who shows the
 *  checkbox + 「完成」 inline button. Mirrors the drawer's primary-action
 *  gate so the two stay consistent. */
const ACTIONABLE_STATUSES = new Set(["PENDING", "CONFIRMED"]);

interface DayDetailPanelProps {
  date: string | null;
  bookings: DayBooking[];
  slots: SlotAvailability[];
  loading: boolean;
  /** 若有篩選，原始筆數（>0 代表已套篩選） */
  filteredFrom?: number | null;
  /** 點 timeline row 時觸發（取代原本 link 到詳情頁） */
  onBookingClick?: (bookingId: string) => void;
  /** ── Batch / inline action wiring (omit to disable) ── */
  selectedIds?: ReadonlySet<string>;
  onToggleSelect?: (id: string) => void;
  onSelectAllActionable?: () => void;
  onClearSelection?: () => void;
  onCompleteBatch?: () => void;
  onCompleteSingle?: (id: string) => void;
  /** Rows currently mid-action — gets disabled + spinner. */
  actingIds?: ReadonlySet<string>;
  batchActing?: boolean;
}

export function DayDetailPanel({
  date,
  bookings,
  slots,
  loading,
  filteredFrom = null,
  onBookingClick,
  selectedIds,
  onToggleSelect,
  onSelectAllActionable,
  onClearSelection,
  onCompleteBatch,
  onCompleteSingle,
  actingIds,
  batchActing = false,
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

  const actionableCount = bookings.filter((b) =>
    ACTIONABLE_STATUSES.has(b.bookingStatus),
  ).length;
  const selectionEnabled =
    !!onToggleSelect &&
    !!selectedIds &&
    !!onCompleteBatch &&
    !!onClearSelection;
  const selectedCount = selectedIds?.size ?? 0;
  const allSelected =
    actionableCount > 0 && selectedCount === actionableCount;

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

        {/* Selection bar — only when at least one row picked */}
        {selectionEnabled && selectedCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-primary-100 bg-primary-50/70 px-4 py-2">
            <span className="text-xs font-medium text-primary-800">
              已選 {selectedCount} 位
              {actionableCount > selectedCount && (
                <span className="ml-1 text-[11px] font-normal text-primary-600">
                  / 可選 {actionableCount}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={onCompleteBatch}
              disabled={batchActing}
              className="inline-flex h-7 items-center rounded-md bg-primary-600 px-3 text-xs font-semibold text-white hover:bg-primary-700 disabled:cursor-wait disabled:opacity-60"
            >
              {batchActing ? "處理中..." : "批次完成服務"}
            </button>
            {!allSelected && onSelectAllActionable && (
              <button
                type="button"
                onClick={onSelectAllActionable}
                disabled={batchActing}
                className="inline-flex h-7 items-center rounded-md border border-primary-300 bg-white px-2.5 text-xs font-medium text-primary-700 hover:bg-primary-50 disabled:opacity-60"
              >
                全選可操作
              </button>
            )}
            <button
              type="button"
              onClick={onClearSelection}
              disabled={batchActing}
              className="ml-auto inline-flex h-7 items-center rounded-md border border-earth-300 bg-white px-2.5 text-xs font-medium text-earth-700 hover:bg-earth-50 disabled:opacity-60"
            >
              清除選取
            </button>
          </div>
        )}

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
            {bookings.map((b) => {
              const actionable = ACTIONABLE_STATUSES.has(b.bookingStatus);
              const isSelected = !!selectedIds?.has(b.id);
              const isActing = !!actingIds?.has(b.id) || batchActing;
              return (
                <li key={b.id}>
                  <TimelineItem
                    booking={b}
                    onClick={onBookingClick}
                    actionable={actionable}
                    selected={isSelected}
                    onToggleSelect={
                      selectionEnabled ? onToggleSelect : undefined
                    }
                    onCompleteSingle={onCompleteSingle}
                    isActing={isActing}
                  />
                </li>
              );
            })}
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
  actionable,
  selected,
  onToggleSelect,
  onCompleteSingle,
  isActing,
}: {
  booking: DayBooking;
  onClick?: (id: string) => void;
  actionable: boolean;
  selected: boolean;
  onToggleSelect?: (id: string) => void;
  onCompleteSingle?: (id: string) => void;
  isActing: boolean;
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

  function handleBodyClick() {
    if (isActing) return;
    if (onClick) onClick(booking.id);
  }

  return (
    <div
      className={`flex items-stretch gap-2 border-l-[3px] bg-white pr-2 transition-colors hover:bg-earth-50 ${borderColor} ${
        isActing ? "opacity-60" : ""
      } ${selected ? "bg-primary-50/40" : ""}`}
    >
      {/* Checkbox column — only on actionable rows so 完成/取消/未到 can't
          accidentally end up in a batch. Wrapped in a label for hit-area; the
          input owns selection state, no need to stopPropagation onto body
          since body click is its own button. */}
      <div className="flex w-8 shrink-0 items-center justify-center pl-2">
        {actionable && onToggleSelect ? (
          <input
            type="checkbox"
            aria-label={`選取 ${booking.customer?.name ?? "預約"}`}
            checked={selected}
            disabled={isActing}
            onChange={() => onToggleSelect(booking.id)}
            className="h-4 w-4 cursor-pointer rounded border-earth-300 text-primary-600 focus:ring-primary-500 disabled:cursor-not-allowed"
          />
        ) : null}
      </div>

      {/* Body — opens drawer on click. Use a real button so keyboard works. */}
      <button
        type="button"
        onClick={handleBodyClick}
        disabled={!onClick || isActing}
        className="flex flex-1 items-start gap-3 py-2.5 text-left disabled:cursor-default"
      >
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
      </button>

      {/* Inline actions — show 完成 only on actionable rows, 查看 always
          (acts as a backup affordance to the body click). */}
      <div className="flex shrink-0 items-center gap-1.5 py-2.5">
        {actionable && onCompleteSingle ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!isActing) onCompleteSingle(booking.id);
            }}
            disabled={isActing}
            className="inline-flex h-7 items-center rounded-md bg-primary-600 px-2.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:cursor-wait disabled:opacity-60"
          >
            {isActing ? "..." : "完成"}
          </button>
        ) : null}
        {onClick ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!isActing) onClick(booking.id);
            }}
            disabled={isActing}
            className="inline-flex h-7 items-center rounded-md border border-earth-300 bg-white px-2.5 text-xs font-medium text-earth-700 hover:bg-earth-50 disabled:opacity-60"
          >
            查看
          </button>
        ) : (
          <Link
            href={`/dashboard/bookings/${booking.id}`}
            className="inline-flex h-7 items-center rounded-md border border-earth-300 bg-white px-2.5 text-xs font-medium text-earth-700 hover:bg-earth-50"
          >
            查看
          </Link>
        )}
      </div>
    </div>
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
