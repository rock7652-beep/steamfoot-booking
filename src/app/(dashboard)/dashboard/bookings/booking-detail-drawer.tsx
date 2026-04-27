"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { RightSheet } from "@/components/admin/right-sheet";
import { StatusBadge, bookingStatusMeta } from "@/components/admin/status-badge";
import {
  fetchBookingDetail,
  type BookingDrawerPayload,
} from "@/server/actions/booking-drawer";
import {
  markCompleted,
  markNoShow,
  cancelBooking,
  revertBookingStatus,
  updateBooking,
} from "@/server/actions/booking";
import { NoShowModal, type NoShowChoice } from "./no-show-modal";
import { RescheduleModal } from "./reschedule-modal";
import { formatWeekdayZh } from "@/lib/date-utils";

/**
 * Lightweight booking handle that the calendar / day panel passes to the
 * drawer the moment it's clicked. Lets the drawer render its header band
 * (status badge, date+time, customer name, plan label, duration) **before**
 * the round-trip to `fetchBookingDetail()` completes — so the user perceives
 * the drawer as instant.
 *
 * Keep this in sync with the small subset that calendar / day panel already
 * have in memory. **Do not** add fields here that require an extra query.
 */
export interface BookingSummary {
  id: string;
  bookingDate: string; // YYYY-MM-DD
  slotTime: string;
  bookingStatus: string;
  isMakeup: boolean;
  people: number;
  customerName: string;
  servicePlanName?: string | null;
  servicePlanCategory?: string | null;
}

interface BookingDetailDrawerProps {
  open: boolean;
  bookingId: string | null;
  /** Pre-loaded summary from calendar / day panel — used for instant header render. */
  summary?: BookingSummary | null;
  onClose: () => void;
  /**
   * Called after a successful drawer action.
   * `newStatus` is the optimistic next state — parent uses it to update
   * cached month / day data without refetching the whole month.
   */
  onUpdated?: (bookingId: string, newStatus: string | null) => void;
}

export function BookingDetailDrawer({
  open,
  bookingId,
  summary,
  onClose,
  onUpdated,
}: BookingDetailDrawerProps) {
  const [data, setData] = useState<BookingDrawerPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isActing, startAction] = useTransition();
  const [noShowOpen, setNoShowOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  // Derived loading state — `data` is "fresh" when its bookingId matches the
  // currently open one. Lets the effect stay clean (no synchronous setState
  // before the async fetch) and avoids the cascading-render lint warning.
  const dataMatches = !!data && data.booking.id === bookingId;
  const loading = !!bookingId && !error && !dataMatches;

  useEffect(() => {
    if (!open || !bookingId) return;
    let canceled = false;
    fetchBookingDetail(bookingId)
      .then((payload) => {
        if (canceled) return;
        setData(payload);
        setError(null);
      })
      .catch((e) => {
        if (canceled) return;
        setError(e?.message ?? "載入失敗");
      });
    return () => {
      canceled = true;
    };
  }, [open, bookingId]);

  /**
   * Run a drawer action. Updates local drawer state optimistically with
   * `nextStatus` so the user sees the new status immediately, and notifies
   * the parent so it can patch its cached month/day data. We deliberately
   * **don't** call `router.refresh()` — the booking server actions already
   * `revalidatePath('/dashboard/bookings')`, so the data cache is invalidated
   * and next navigation pulls fresh data; in the meantime the calendar's
   * lifted state stays in sync via `onUpdated`.
   */
  function wrapAction(
    label: string,
    action: () => Promise<{ success: boolean; error?: string } | unknown>,
    nextStatus: string | null,
    opts?: { onSuccess?: () => void },
  ) {
    if (!bookingId) return;
    const id = bookingId;
    startAction(async () => {
      try {
        const result = (await action()) as
          | { success: boolean; error?: string }
          | undefined;
        if (result && result.success === false) {
          toast.error(result.error ?? "操作失敗");
          return;
        }
        toast.success(label);
        opts?.onSuccess?.();

        if (nextStatus) {
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  booking: {
                    ...prev.booking,
                    bookingStatus: nextStatus,
                    isCheckedIn:
                      nextStatus === "COMPLETED" ? true : prev.booking.isCheckedIn,
                  },
                }
              : prev,
          );
        }

        onUpdated?.(id, nextStatus);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "操作失敗";
        toast.error(msg);
      }
    });
  }

  function handleComplete() {
    wrapAction("已完成服務", () => markCompleted(bookingId!), "COMPLETED");
  }

  function handleNoShowConfirm(choice: NoShowChoice) {
    const labelMap: Record<NoShowChoice, string> = {
      DEDUCTED: "已標記未到並扣堂",
      NOT_DEDUCTED_WITH_MAKEUP: "已標記未到並發補課",
      NOT_DEDUCTED_NO_MAKEUP: "已標記未到（不處理）",
    };
    wrapAction(
      labelMap[choice],
      () => markNoShow(bookingId!, choice),
      "NO_SHOW",
      { onSuccess: () => setNoShowOpen(false) },
    );
  }

  function handleRescheduleConfirm(newDate: string, newSlotTime: string) {
    // Reschedule moves the booking across days — the parent needs to
    // re-fetch the day panel rather than patch in place. We pass `null`
    // for nextStatus so the parent treats this as "needs day refresh".
    wrapAction(
      "已改期",
      () =>
        updateBooking(bookingId!, { bookingDate: newDate, slotTime: newSlotTime }),
      null,
      { onSuccess: () => setRescheduleOpen(false) },
    );
  }

  function handleCancel() {
    if (!confirm("確定取消這筆預約？")) return;
    wrapAction("已取消預約", () => cancelBooking(bookingId!), "CANCELLED");
  }

  function handleRevert() {
    // Revert returns to PENDING per booking.ts:867 logic.
    wrapAction("已還原狀態", () => revertBookingStatus(bookingId!), "PENDING");
  }

  // What we have to render:
  //   1. Full payload matching current bookingId — preferred when loaded.
  //   2. Pre-loaded summary — instant render of header band; body shows skeleton.
  //   3. Neither — full skeleton (rare; only when summary not provided).
  const hasFullData = dataMatches;
  const hasSummary = !!summary;
  const showHeaderFromSummary = !hasFullData && hasSummary;

  return (
    <>
      <RightSheet
        open={open}
        onClose={onClose}
        labelledById="booking-drawer-title"
      >
        {hasFullData && data ? (
          <DrawerContent
            payload={data}
            isActing={isActing}
            onClose={onClose}
            actions={{
              complete: handleComplete,
              noShow: () => setNoShowOpen(true),
              cancel: handleCancel,
              revert: handleRevert,
              reschedule: () => setRescheduleOpen(true),
            }}
          />
        ) : showHeaderFromSummary && summary ? (
          <SummaryDrawerContent
            summary={summary}
            loading={loading}
            error={error}
            onClose={onClose}
          />
        ) : (
          <DrawerSkeleton onClose={onClose} error={error} />
        )}
      </RightSheet>
      <NoShowModal
        open={noShowOpen && !!data}
        onClose={() => setNoShowOpen(false)}
        onConfirm={handleNoShowConfirm}
        loading={isActing}
      />
      {data && (
        <RescheduleModal
          open={rescheduleOpen}
          onClose={() => setRescheduleOpen(false)}
          currentDate={data.booking.bookingDate}
          currentSlotTime={data.booking.slotTime}
          people={data.booking.people}
          onConfirm={handleRescheduleConfirm}
          loading={isActing}
        />
      )}
    </>
  );
}

// ============================================================
// Drawer content
// ============================================================

interface DrawerActions {
  complete: () => void;
  noShow: () => void;
  cancel: () => void;
  revert: () => void;
  reschedule: () => void;
}

function DrawerContent({
  payload,
  isActing,
  onClose,
  actions,
}: {
  payload: BookingDrawerPayload;
  isActing: boolean;
  onClose: () => void;
  actions: DrawerActions;
}) {
  const { booking, customerSummary } = payload;
  const meta = bookingStatusMeta(booking.bookingStatus, booking.isCheckedIn);
  const amount = computeAmount(booking);
  const duration = booking.servicePlan?.category === "TRIAL" ? 30 : 60;
  const endTime = computeEndTime(booking.slotTime, duration);
  const dateLabel = formatDateLabel(booking.bookingDate);

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-earth-200 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <StatusBadge variant={meta.variant}>{meta.label}</StatusBadge>
            <span className="text-sm font-semibold tabular-nums text-earth-700">
              {booking.bookingDate.slice(5).replace("-", "/")} {booking.slotTime}
            </span>
          </div>
          <h2
            id="booking-drawer-title"
            className="mt-1 truncate text-lg font-bold text-earth-900"
          >
            {booking.customer.name}
            {booking.people > 1 && (
              <span className="ml-1 text-sm font-normal text-earth-400">
                ×{booking.people}
              </span>
            )}
          </h2>
          <p className="mt-0.5 truncate text-sm text-earth-500">
            {booking.isMakeup
              ? "補課 · "
              : booking.servicePlan?.name
                ? `${booking.servicePlan.name} · `
                : ""}
            {duration} 分鐘
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-earth-500 hover:bg-earth-100"
          aria-label="關閉"
        >
          ✕
        </button>
      </div>

      {/* Body — scrollable */}
      <div className="flex-1 overflow-y-auto">
        {/* Section A: 預約資訊 */}
        <Section title="預約資訊">
          <KV label="日期" value={dateLabel} />
          <KV
            label="時間"
            value={
              <span className="tabular-nums">
                {booking.slotTime} - {endTime}
              </span>
            }
          />
          <KV
            label="教練"
            value={booking.revenueStaff?.displayName ?? "未指派"}
            icon={
              booking.revenueStaff?.colorCode && (
                <span
                  className="mr-1.5 inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: booking.revenueStaff.colorCode }}
                />
              )
            }
          />
          {booking.serviceStaff &&
            booking.serviceStaff.id !== booking.revenueStaff?.id && (
              <KV
                label="值班店長"
                value={booking.serviceStaff.displayName}
              />
            )}
          <KV
            label="服務"
            value={
              booking.isMakeup
                ? "補課"
                : (booking.servicePlan?.name ?? "—")
            }
          />
          <KV label="人數" value={`${booking.people} 人`} />
          <KV label="金額" value={amount} />
        </Section>

        {/* Section B: 顧客資訊 */}
        <Section title="顧客資訊">
          <KV label="姓名" value={booking.customer.name} />
          <KV
            label="電話"
            value={
              booking.customer.phone ? (
                <a
                  href={`tel:${booking.customer.phone}`}
                  className="text-primary-600 hover:text-primary-700"
                >
                  {booking.customer.phone}
                </a>
              ) : (
                "—"
              )
            }
          />
          <KV
            label="累積完成"
            value={`${customerSummary.totalBookings} 次`}
          />
          <KV
            label="最近到店"
            value={
              customerSummary.lastVisit
                ? customerSummary.lastVisit
                : customerSummary.isNewCustomer
                  ? "（新客）"
                  : "—"
            }
          />
          <div className="col-span-2 mt-1 flex gap-2">
            <Link
              href={`/dashboard/customers/${booking.customer.id}`}
              className="inline-flex h-7 items-center rounded-md border border-earth-300 bg-white px-3 text-xs font-medium text-earth-700 hover:bg-earth-50"
            >
              查看顧客資料
            </Link>
            <Link
              href={`/dashboard/customers/${booking.customer.id}#bookings`}
              className="inline-flex h-7 items-center rounded-md border border-earth-300 bg-white px-3 text-xs font-medium text-earth-700 hover:bg-earth-50"
            >
              查看歷史預約
            </Link>
          </div>
        </Section>

        {/* Section C: 方案 / 付款 */}
        <Section title="方案 / 付款">
          <KV label="類型" value={formatBookingType(booking)} />
          <KV
            label="方案"
            value={
              booking.customerPlanWallet?.plan.name ??
              booking.servicePlan?.name ??
              "—"
            }
          />
          {booking.customerPlanWallet && (
            <KV
              label="套餐剩餘"
              value={`${booking.customerPlanWallet.remainingSessions} / ${booking.customerPlanWallet.totalSessions} 堂`}
            />
          )}
          <KV
            label="付款狀態"
            value={
              booking.isMakeup
                ? "補課（免費）"
                : booking.bookingType === "PACKAGE_SESSION"
                  ? "套餐扣堂"
                  : booking.servicePlan
                    ? "現場收款"
                    : "—"
            }
          />
        </Section>

        {/* Section D: 備註 */}
        {booking.notes && (
          <Section title="備註">
            <div className="col-span-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-earth-700">
              {booking.notes}
            </div>
          </Section>
        )}
      </div>

      {/* Section E: Actions */}
      <ActionFooter
        booking={booking}
        isActing={isActing}
        actions={actions}
      />
    </>
  );
}

/**
 * Renders the same header band as the full drawer using only the lightweight
 * `summary` already in memory — appears instantly on click. The body slot
 * shows skeleton placeholders until `fetchBookingDetail` resolves.
 */
function SummaryDrawerContent({
  summary,
  loading,
  error,
  onClose,
}: {
  summary: BookingSummary;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const meta = bookingStatusMeta(summary.bookingStatus, false);
  const duration = summary.servicePlanCategory === "TRIAL" ? 30 : 60;

  return (
    <>
      <div className="flex items-start justify-between gap-3 border-b border-earth-200 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <StatusBadge variant={meta.variant}>{meta.label}</StatusBadge>
            <span className="text-sm font-semibold tabular-nums text-earth-700">
              {summary.bookingDate.slice(5).replace("-", "/")} {summary.slotTime}
            </span>
          </div>
          <h2
            id="booking-drawer-title"
            className="mt-1 truncate text-lg font-bold text-earth-900"
          >
            {summary.customerName}
            {summary.people > 1 && (
              <span className="ml-1 text-sm font-normal text-earth-400">
                ×{summary.people}
              </span>
            )}
          </h2>
          <p className="mt-0.5 truncate text-sm text-earth-500">
            {summary.isMakeup
              ? "補課 · "
              : summary.servicePlanName
                ? `${summary.servicePlanName} · `
                : ""}
            {duration} 分鐘
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-earth-500 hover:bg-earth-100"
          aria-label="關閉"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : (
          <>
            {loading && (
              <p className="text-[11px] text-earth-400">載入詳細資料…</p>
            )}
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-md border border-earth-100 bg-earth-50"
              />
            ))}
          </>
        )}
      </div>
    </>
  );
}

function ActionFooter({
  booking,
  isActing,
  actions,
}: {
  booking: BookingDrawerPayload["booking"];
  isActing: boolean;
  actions: DrawerActions;
}) {
  const status = booking.bookingStatus;
  const primaries: Array<{ label: string; onClick: () => void }> = [];
  const secondaries: Array<{ label: string; onClick: () => void; tone?: "danger" }> = [];

  // main schema 無 CHECKED_IN：PENDING/CONFIRMED 直接走「完成服務」→ COMPLETED。
  // （checkInBooking server action 實際上就是 markCompleted 的 alias，保留舊命名無意義。）
  if (status === "PENDING" || status === "CONFIRMED") {
    primaries.push({ label: "完成服務", onClick: actions.complete });
    secondaries.push({ label: "改時間", onClick: actions.reschedule });
    secondaries.push({ label: "標記未到", onClick: actions.noShow });
    secondaries.push({ label: "取消預約", onClick: actions.cancel, tone: "danger" });
  } else if (status === "COMPLETED") {
    secondaries.push({ label: "還原狀態", onClick: actions.revert });
  } else if (status === "NO_SHOW") {
    secondaries.push({ label: "改時間", onClick: actions.reschedule });
    secondaries.push({ label: "還原狀態", onClick: actions.revert });
  } else if (status === "CANCELLED") {
    secondaries.push({ label: "還原狀態", onClick: actions.revert });
  }

  return (
    <div className="border-t border-earth-200 bg-earth-50 px-4 py-3">
      {primaries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {primaries.map((a, i) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              disabled={isActing}
              className={`inline-flex h-9 flex-1 items-center justify-center rounded-md px-3 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 ${
                i === 0
                  ? "bg-primary-600 text-white hover:bg-primary-700"
                  : "border border-primary-300 bg-white text-primary-700 hover:bg-primary-50"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {secondaries.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            disabled={isActing}
            className={`inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium transition-colors disabled:cursor-wait disabled:opacity-60 ${
              a.tone === "danger"
                ? "border-red-200 bg-white text-red-600 hover:bg-red-50"
                : "border-earth-300 bg-white text-earth-700 hover:bg-earth-50"
            }`}
          >
            {a.label}
          </button>
        ))}
        <div className="ml-auto">
          <Link
            href={`/dashboard/bookings/${booking.id}`}
            className="inline-flex h-8 items-center text-xs font-medium text-primary-600 hover:text-primary-700"
          >
            完整頁面 →
          </Link>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// small presentational helpers
// ============================================================

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-earth-100 px-4 py-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-earth-500">
        {title}
      </h3>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
        {children}
      </div>
    </div>
  );
}

function KV({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <>
      <div className="min-w-[4.5rem] text-xs text-earth-500">{label}</div>
      <div className="flex items-center text-sm text-earth-800">
        {icon}
        <span className="min-w-0 truncate">{value}</span>
      </div>
    </>
  );
}

function DrawerSkeleton({
  onClose,
  error,
}: {
  onClose: () => void;
  error: string | null;
}) {
  return (
    <>
      <div className="flex items-start justify-between border-b border-earth-200 px-4 py-3">
        <div className="flex-1 space-y-2">
          <div className="h-5 w-32 animate-pulse rounded bg-earth-100" />
          <div className="h-6 w-24 animate-pulse rounded bg-earth-100" />
          <div className="h-4 w-28 animate-pulse rounded bg-earth-100" />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-earth-500 hover:bg-earth-100"
          aria-label="關閉"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 space-y-4 p-4">
        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-md border border-earth-100 bg-earth-50"
            />
          ))
        )}
      </div>
    </>
  );
}

// ============================================================
// pure helpers
// ============================================================

function computeAmount(booking: BookingDrawerPayload["booking"]): string {
  if (booking.isMakeup) return "補課（免費）";
  if (!booking.servicePlan) return "—";
  const price = booking.servicePlan.price;
  if (!price) return "—";
  if (
    booking.bookingType === "PACKAGE_SESSION" &&
    booking.servicePlan.sessionCount > 1
  ) {
    const per = Math.round(price / booking.servicePlan.sessionCount);
    return `≈ NT$ ${per.toLocaleString()} / 堂（方案 NT$ ${price.toLocaleString()}）`;
  }
  return `NT$ ${price.toLocaleString()}`;
}

function formatBookingType(booking: BookingDrawerPayload["booking"]): string {
  if (booking.isMakeup) return "補課";
  switch (booking.bookingType) {
    case "FIRST_TRIAL":
      return "首次體驗";
    case "SINGLE":
      return "單次";
    case "PACKAGE_SESSION":
      return "套餐扣堂";
    default:
      return booking.bookingType;
  }
}

function computeEndTime(start: string, durationMinutes: number): string {
  const [h, m] = start.split(":").map(Number);
  const total = h * 60 + m + durationMinutes;
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}（${formatWeekdayZh(iso)}）`;
}
