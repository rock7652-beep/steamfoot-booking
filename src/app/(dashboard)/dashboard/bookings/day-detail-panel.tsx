"use client";
import { useId, useState, type ReactNode } from "react";
import { RosterToolbar, RosterMoreMenu, rosterRowClassName, rosterStatusButtonClassName } from "@/components/admin/roster-primitives";
import type { NoteSaveResult } from "@/components/operations/retained-note-editor";
import { updateBookingNoteAction } from "@/server/actions/booking-note";
import { RosterReminders } from "@/components/admin/roster-reminders";
import { CustomerListIdentity } from "@/components/customer-list-identity";
import styles from "./day-detail-panel.module.css";
import { ModalPanel } from "@/components/admin/modal-panel";

import { BookingActionFeedback } from "./booking-action-feedback";

import { DashboardLink as Link } from "@/components/dashboard-link";
import { bookingStatusMeta } from "@/components/admin/status-badge";
import { EmptyStateCompact } from "@/components/admin/empty-state-compact";
import { SteamBookingDrawer } from "./steam-booking-drawer";
import { TrialBookingDrawer } from "../_components/trial-booking-drawer";
import { resolveTrialDisplayAmount } from "./compute-amount";
import { PeopleBadge } from "./people-badge";
import { remainingSessionsState } from "@/lib/remaining-sessions-label";
import { bookingPlanBadge } from "@/lib/wallet-booking-integrity";
import { bookingPlanExpiry } from "@/lib/booking-plan-expiry";
import type { SlotAvailability } from "@/types";

export interface DayBooking {
  id: string;
  notes?: string | null;
  slotTime: string;
  people: number;
  recurrenceIndex?: number | null;
  recurrenceTotalOccurrences?: number | null;
  /** 顧客透過提醒連結確認會到；有值時門市預約清單顯示確認標記。 */
  customerConfirmedAt?: Date | null;
  /** PR-3d：實際到店人數（FIRST_TRIAL；null = 未記錄／全到）。
   *  部分到店時 list row 在 PeopleBadge 後顯示「實到 N/M」。 */
  attendedPeople: number | null;
  isMakeup: boolean;
  isCheckedIn: boolean;
  bookingStatus: string;
  /** 體驗 499 PR-2/3：FIRST_TRIAL → badge 顯示「體驗·未收款 / 已收款」；
   *  expectedAmount 為建立時快照、collectedAmount 為實收金額 */
  bookingType: string;
  expectedAmount: number | null;
  /** PR-D1D：FIRST_TRIAL badge 顯示金額容錯來源（store 預設體驗價）；
   *  其他 type 為 null。LIFF 建立的體驗 `expectedAmount=null` 時用此 fallback。 */
  trialDefaultPrice: number | null;
  collected: boolean;
  collectedAmount: number | null;
  /** 本次成功 SESSION_DEDUCTION 實際扣除的方案名稱；交易紀錄為準。 */
  deductedPlanNames?: string[];
  customer: {
    id?: string;
    name: string;
    phone: string;
    /** 內部服務備註（後台限定）。有值時當日清單顯示一行截斷提醒。 */
    notes?: string | null;
    serviceNote?: string | null;
    assignedStaff?: { displayName: string; colorCode: string } | null;
    /** 有效 PACKAGE 剩餘堂數加總（ACTIVE + 未過期 + 尚有剩餘；排除 TRIAL/SINGLE/點數/用完）。
     *  0 = 無有效方案。用於姓名列旁顯示「剩 N 堂」提醒儲值。 */
    validPackageSessions: number;
  };
  revenueStaff: { id: string; displayName: string; colorCode: string } | null;
  serviceStaff: { id: string; displayName: string } | null;
  servicePlan: { name: string } | null;
  /** PACKAGE_SESSION 預約實際使用的方案 — 來自 wallet 關聯（後台建立流程
   *  不寫 servicePlanId，正解走 customerPlanWallet.plan.name）。 */
  customerPlanWallet: {
    status: string;
    remainingSessions: number;
    expiryDate: Date | null;
    plan: { name: string };
  } | null;
}

/** Statuses that can still be moved to COMPLETED — defines who shows the
 *  checkbox + 「完成」 inline button. Mirrors the drawer's primary-action
 *  gate so the two stay consistent. */
const ACTIONABLE_STATUSES = new Set(["PENDING", "CONFIRMED"]);

interface DayDetailPanelProps {
  onCreated?: () => void;
  toolbar?: ReactNode;
  date: string | null;
  bookings: DayBooking[];
  /** Unfiltered day totals stay stable while selecting/searching. */
  allBookings?: DayBooking[];
  batchResult?: string;
  slots: SlotAvailability[];
  /** Slots availability has been resolved for this date (cache hit or fetch
   *  finished). Used to gate the "該日不營業" hint — without it we'd flash
   *  that label briefly while slots load on first click. */
  slotsKnown?: boolean;
  /** Slots fetch is in flight for the currently selected date. Lets the
   *  empty-state branch show a soft "檢查中" instead of a wrong empty hint. */
  slotsLoading?: boolean;
  slotsError?: boolean;
  /** 該日營業狀態（從月份摘要 derive 出來）。null 代表無法判斷（例如 ADMIN
   *  全店視角無 store-specific 摘要）。用於 0 預約時的文案分流：
   *  open/custom → 「可預約（尚無預約）」；closed/training → 「不可預約 — 公休 / 進修」。 */
  daySchedule?: { status: "open" | "closed" | "training" | "custom"; slotCount: number } | null;
  /** 整個月是否完全沒有任何預約 — 控制「未選日期」時的引導文案 */
  monthHasAnyBookings?: boolean;
  /** 若有篩選，原始筆數（>0 代表已套篩選） */
  filteredFrom?: number | null;
  /** 點 timeline row 時觸發（取代原本 link 到詳情頁） */
  onBookingClick?: (bookingId: string, intent?: "collect") => void;
  noteScope?: string;
  canEditBookingNote?: boolean;
  onBookingNoteSaved?: (bookingId: string, value: string | null) => void;
  onSaveBookingNote?: (bookingId: string, notes: string | null, expectedNotes: string | null) => Promise<NoteSaveResult>;
  /** ── Batch / inline action wiring (omit to disable) ── */
  selectedIds?: ReadonlySet<string>;
  onToggleSelect?: (id: string) => void;
  onSelectAllActionable?: () => void;
  onClearSelection?: () => void;
  onCompleteBatch?: () => void;
  onCompleteSingle?: (id: string) => void;
  onRevertSingle?: (id: string) => void;
  /** Rows currently mid-action — gets disabled + spinner. */
  actionStates?: Record<string, import("@/hooks/use-responsive-action").SaveState>;
  onCheckAction?: (id: string) => void;
  actingIds?: ReadonlySet<string>;
  batchActing?: boolean;
  readOnly?: boolean;
}

export function DayDetailPanel({
  onCreated,
  toolbar,
  date,
  bookings,
  allBookings = bookings,
  batchResult,
  slots,
  slotsKnown = true,
  slotsLoading = false,
  slotsError = false,
  daySchedule = null,
  monthHasAnyBookings = false,
  filteredFrom = null,
  onBookingClick,
  noteScope = "steam",
  canEditBookingNote = false,
  onBookingNoteSaved,
  onSaveBookingNote,
  selectedIds,
  onToggleSelect,
  onSelectAllActionable,
  onClearSelection,
  onCompleteBatch,
  onCompleteSingle,
  onRevertSingle,
  actionStates,
  onCheckAction,
  actingIds,
  batchActing = false,
  readOnly = false,
}: DayDetailPanelProps) {
  const [batchMode, setBatchMode] = useState(false);
  const [confirmBatch, setConfirmBatch] = useState(false);
  const confirmationId = useId();
  if (!date) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-earth-200 bg-white p-4">
          <EmptyStateCompact
            title={
              monthHasAnyBookings
                ? "點選日期以查看詳情"
                : "本月尚無預約紀錄"
            }
            hint={
              monthHasAnyBookings
                ? "左側月曆點任一天會在此顯示當日預約"
                : readOnly
                  ? "查看模式下可閱讀預約資料，不能建立或調整預約"
                  : "點月曆任一日期 → 從右上角「＋ 新增預約」建立"
            }
            size="section"
          />
        </div>
      </div>
    );
  }

  const [, month, day] = date.split("-").map(Number);
  const monthDay = `${month}/${day}`;

  const stats = computeStats(allBookings);
  const selectedBookings = bookings.filter(b => selectedIds?.has(b.id) && ACTIONABLE_STATUSES.has(b.bookingStatus));

  const actionableCount = bookings.filter((b) =>
    ACTIONABLE_STATUSES.has(b.bookingStatus),
  ).length;
  const selectionEnabled =
    !readOnly &&
    !!onToggleSelect &&
    !!selectedIds &&
    !!onCompleteBatch &&
    !!onClearSelection;
  const selectedCount = selectedBookings.length;
  const selectedPeople = selectedBookings.reduce((sum, b) => sum + b.people, 0);
  const allSelected =
    actionableCount > 0 && selectedCount === actionableCount;

  return (
    <div className="@container flex h-full flex-col">
      <div className="relative z-40 shrink-0 px-4 py-3">
        <RosterToolbar label="當日預約工具列">
          <span className="inline-flex min-h-11 flex-wrap items-center gap-x-2 rounded-lg border border-primary-500 bg-primary-50 px-3 text-sm text-primary-800">
            <span>預約 {stats.total} 筆・共 {stats.people} 人</span>
            {stats.makeup > 0 && <span>其中補課 {stats.makeup} 人</span>}
          </span>
          {stats.checkedIn > 0 && <KpiChip label="到店" value={stats.checkedIn} />}
          {stats.completed > 0 && <KpiChip label="完成人數" value={stats.completed} />}
          {stats.noShow > 0 && <KpiChip label="未到人數" value={stats.noShow} tone="danger" />}
          {toolbar}
          {selectionEnabled && <button type="button" aria-pressed={batchMode} disabled={batchActing} className="min-h-11 rounded-lg border border-earth-200 px-3 text-sm" onClick={() => { setBatchMode(!batchMode); onClearSelection?.(); }}>{batchMode ? "取消批次" : "批次完成"}</button>}
          {filteredFrom != null && <span role="status" className="text-sm text-primary-700">符合 {bookings.length} 筆</span>}
          {readOnly && <span className="text-sm text-amber-700">查看模式</span>}
        </RosterToolbar>
      </div>

      {selectionEnabled && batchMode && (
        <div className="shrink-0 border-y border-primary-100 bg-primary-50/70 px-4 py-2">
          <RosterToolbar label="批次完成工具列">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 px-1 text-sm font-medium text-primary-800">
              <input type="checkbox" aria-label="全選目前清單可完成的預約" checked={allSelected}
                ref={node => { if (node) node.indeterminate = selectedCount > 0 && !allSelected; }}
                disabled={batchActing || actionableCount === 0 || !onSelectAllActionable}
                onChange={() => allSelected ? onClearSelection?.() : onSelectAllActionable?.()}
                className="h-4 w-4 rounded border-earth-300 text-primary-600" />
              全選
            </label>
            <span role="status" className="text-sm text-primary-800">已選 {selectedCount} 筆・共 {selectedPeople} 人</span>
            <button type="button" onClick={() => setConfirmBatch(true)} disabled={batchActing || selectedCount === 0}
              className="inline-flex min-h-11 items-center rounded-lg bg-primary-600 px-3 text-sm font-semibold text-white disabled:opacity-50">
              {batchActing ? "處理中…" : `完成所選（${selectedCount} 筆）`}
            </button>
            <button type="button" onClick={onClearSelection} disabled={batchActing || selectedCount === 0}
              className="min-h-11 rounded-lg border border-earth-300 bg-white px-3 text-sm text-earth-700 disabled:opacity-50">清除選取</button>
          </RosterToolbar>
          {batchResult && <p role="status" className="mt-1 text-sm text-earth-700">{batchResult}</p>}
        </div>
      )}
      <ModalPanel open={confirmBatch} onClose={() => setConfirmBatch(false)} labelledById={confirmationId}>
        <div className="p-4">
          <h2 id={confirmationId} className="font-semibold text-earth-900">確認完成服務</h2>
          <p className="mt-3 text-sm text-earth-700">{monthDay}・已選 {selectedCount} 筆預約，共 {selectedPeople} 人。</p>
          <p className="mt-2 text-sm text-earth-600">請確認顧客已到店並完成服務。依原有方案規則扣堂，收款狀態不變；可由個別預約還原。</p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" className="min-h-11 rounded-lg border border-earth-200 px-3 text-sm" onClick={() => setConfirmBatch(false)}>返回</button>
            <button type="button" disabled={batchActing || selectedCount === 0} className="min-h-11 rounded-lg bg-primary-600 px-3 text-sm font-semibold text-white disabled:opacity-50"
              onClick={() => { setConfirmBatch(false); onCompleteBatch?.(); }}>確認完成</button>
          </div>
        </div>
      </ModalPanel>
      <div className="min-h-0 flex-1 px-4 pb-3">
      <div className={`${styles.rosterContainer} flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-earth-200 bg-white`}>
        <div className="min-h-0 flex-1 overflow-y-auto">
        <div aria-hidden="true" className={`sticky top-0 z-30 ${styles.columnHeader} border-b border-earth-200 bg-earth-50 py-2 pr-2 text-sm font-medium text-earth-600`}>
          <span />
          <div className={styles.rowBody}><span>時間／人數</span><span className={styles.identityHeader}><span>顧客</span><span>電話</span></span><span>所屬店長</span><span>方案／堂數</span><span>標籤／備註</span></div>
          <span />
        </div>

        {bookings.length === 0 ? (
          <div className="p-4">
            <EmptyStateCompact
              {...buildEmptyStateProps({
                date,
                monthDay,
                filteredFrom,
                daySchedule,
                slotsKnown,
                slotsLoading,
                slotsError,
                slotsCount: slots.length,
                readOnly,
                onCreated,
              })}
            />
          </div>
        ) : (
          <ul className="divide-y divide-earth-100">
            {bookings.map((b) => {
              const actionable = ACTIONABLE_STATUSES.has(b.bookingStatus);
              const isSelected = !!selectedIds?.has(b.id);
              const isActing = !!actingIds?.has(b.id) || batchActing;
              return (
                <li key={b.id}>
                  <TimelineItem
                    booking={b}
                    noteScope={`${noteScope}:${date}`}
                    canEditBookingNote={canEditBookingNote}
                    onBookingNoteSaved={onBookingNoteSaved}
                    onSaveBookingNote={onSaveBookingNote}
                    onClick={onBookingClick}
                    readOnly={readOnly}
                    actionable={!readOnly && actionable}
                    selected={isSelected}
                    onToggleSelect={
                      selectionEnabled && batchMode ? onToggleSelect : undefined
                    }
                    onCompleteSingle={readOnly ? undefined : onCompleteSingle}
                    onRevertSingle={readOnly ? undefined : onRevertSingle}
                    isActing={isActing}
                  />
                  <BookingActionFeedback state={actionStates?.[b.id]} onCheck={() => onCheckAction?.(b.id)} />
                </li>
              );
            })}
          </ul>
        )}
        </div>
      </div>
      </div>

      {/* 底部：快速操作 sticky footer（不跟著清單捲動、不被遮住） */}
      <div className="shrink-0 border-t border-earth-200 bg-white px-4 py-2">
        {readOnly ? (
          <p className="text-sm leading-relaxed text-earth-500">
            查看模式提供完整閱讀能力，建立、完成、取消、收款與改期請由該店自行完成。
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <SteamBookingDrawer date={date} triggerLabel={`＋ 新增預約於 ${monthDay}`} onCreated={onCreated}/>
            <SteamBookingDrawer date={date} makeup triggerLabel="新增補課" onCreated={onCreated}/>
            {/* 體驗 499 PR-2：從月曆空時段建立未收款體驗預約（預填日期；同一 Drawer） */}
            <TrialBookingDrawer
              preset={{ date: date ?? undefined }}
              triggerLabel="建立體驗預約"
              onCreated={onCreated}
              triggerClassName="inline-flex min-h-11 items-center rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm font-medium text-amber-800 hover:bg-amber-100"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function TimelineItem({
  booking,
  noteScope,
  canEditBookingNote,
  onBookingNoteSaved,
  onSaveBookingNote,
  readOnly = false,
  onClick,
  actionable,
  selected,
  onToggleSelect,
  onCompleteSingle,
  onRevertSingle,
  isActing,
}: {
  booking: DayBooking;
  noteScope: string;
  canEditBookingNote: boolean;
  onBookingNoteSaved?: (bookingId: string, value: string | null) => void;
  onSaveBookingNote?: (bookingId: string, notes: string | null, expectedNotes: string | null) => Promise<NoteSaveResult>;
  readOnly?: boolean;
  onClick?: (id: string, intent?: "collect") => void;
  actionable: boolean;
  selected: boolean;
  onToggleSelect?: (id: string) => void;
  onCompleteSingle?: (id: string) => void;
  onRevertSingle?: (id: string) => void;
  isActing: boolean;
}) {
  const needsCollection = !booking.collected && (booking.bookingType === "FIRST_TRIAL" || booking.bookingType === "SINGLE");
  const meta = bookingStatusMeta(booking.bookingStatus, booking.isCheckedIn);
  // 有效 PACKAGE 堂數提醒（複用 PR #280 顧客清單同款 helper，定義一致）。
  const sessions = remainingSessionsState(booking.customer?.validPackageSessions ?? 0);
  const planBadge = bookingPlanBadge({
    bookingType: booking.bookingType,
    bookingStatus: booking.bookingStatus,
    collected: booking.collected,
    linkedWalletRemaining: booking.customer?.validPackageSessions ?? 0,
    isMakeup: booking.isMakeup,
  });
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

  // 所屬店長 = customer.assignedStaff（不再 fallback 到 revenue/service staff）
  const assignedStaffName =
    booking.customer?.assignedStaff?.displayName ?? "未指派";

  // PR-D1D + PR-3c：FIRST_TRIAL badge 顯示「本次總額」容錯。
  //   collected   → collectedAmount(snapshot) → expectedAmount(snapshot) → default×people → "—"
  //   未收款       → expectedAmount(snapshot) → default×people → "—"
  // expectedAmount / collectedAmount 為快照總額（PR-3c 起）；fallback 才用 default × people。
  let trialAmountText = "—";
  if (booking.bookingType === "FIRST_TRIAL") {
    const primary = booking.collected
      ? booking.collectedAmount ?? booking.expectedAmount
      : booking.expectedAmount;
    const display = resolveTrialDisplayAmount({
      snapshotTotal: primary,
      unitFallback: booking.trialDefaultPrice,
      people: booking.people,
    });
    if (display != null) trialAmountText = display.toLocaleString();
  }
  // 方案來源 fallback chain：
  //   1) customerPlanWallet.plan.name — 與剩餘堂數、到期日使用相同的綁定方案
  //   2) servicePlan.name — 未綁定 wallet 時的服務名稱
  //   3) 補課（沒方案）→ 「補課」
  //   4) 其他 → 「—」
  const planLabel =
    booking.customerPlanWallet?.plan?.name
    ?? booking.servicePlan?.name
    ?? (booking.isMakeup ? "補課" : "—");
  const expiry = booking.bookingType === "PACKAGE_SESSION" && !booking.isMakeup
    ? bookingPlanExpiry(booking.customerPlanWallet?.expiryDate)
    : null;
  const deductedPlanNames = booking.deductedPlanNames ?? [];
  const deductedPlanLabel = deductedPlanNames.length > 0
    ? deductedPlanNames.join("＋")
    : planLabel;

  function handleBodyClick() {
    if (isActing) return;
    if (onClick) onClick(booking.id);
  }

  return (
    <div
      data-batch={!!onToggleSelect}
      className={`${styles.rosterRow} flex border-l-[3px] transition-colors ${rosterRowClassName} ${borderColor} ${
        isActing ? "opacity-60" : ""
      } ${selected ? "bg-primary-50/40" : ""}`}
    >
      {/* Checkbox column — only on actionable rows so 完成/取消/未到 can't
          accidentally end up in a batch. Wrapped in a label for hit-area; the
          input owns selection state, no need to stopPropagation onto body
          since body click is its own button. */}
      {onToggleSelect && <label className="flex min-h-11 w-11 shrink-0 items-center justify-center">
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
      </label>}

      {!onToggleSelect && <div className="relative z-20 flex w-11 shrink-0 flex-col justify-center">
        {!(actionable && onCompleteSingle) && !(booking.bookingStatus === "COMPLETED" && onRevertSingle) && <span aria-label={meta.label} className="inline-flex min-h-11 min-w-11 items-center justify-center"><span aria-hidden="true" className={`inline-flex h-6 w-6 items-center justify-center rounded-full border-2 ${booking.bookingStatus === "COMPLETED" ? "border-primary-700 bg-primary-700 text-white" : "border-earth-400 text-earth-500"}`}>{booking.bookingStatus === "COMPLETED" ? "✓" : booking.bookingStatus === "NO_SHOW" || booking.bookingStatus === "CANCELED" ? "−" : ""}</span></span>}
        {actionable && onCompleteSingle ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!isActing) {
                if(needsCollection && onClick) onClick(booking.id,"collect");
                else onCompleteSingle(booking.id);
              }
            }}
            disabled={isActing}
            className={rosterStatusButtonClassName}
            aria-label={`${needsCollection ? "收款並完成" : "完成"} ${booking.customer.name} 的預約`} title={needsCollection ? "先收款，再完成服務" : "完成服務"}
          >
            <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-earth-400">{isActing ? "…" : ""}</span><span className="sr-only">{isActing ? "儲存中…" : "完成"}</span>
          </button>
        ) : null}
        {booking.bookingStatus === "COMPLETED" && onRevertSingle ? (
          <button type="button" disabled={isActing}
            onClick={(event) => { event.stopPropagation(); if (!isActing) onRevertSingle(booking.id); }}
            className={rosterStatusButtonClassName} aria-label={`還原 ${booking.customer.name} 的預約`} title="還原完成">
            <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-primary-700 bg-primary-700 text-white">{isActing ? "…" : "✓"}</span><span className="sr-only">{isActing ? "儲存中…" : "還原"}</span>
          </button>
        ) : null}
      </div>}
      {/* 詳情按鈕與撥號連結分開，避免撥號時開啟詳情。 */}
      <div className={`${styles.rowBody} relative isolate min-w-0 flex-1 text-left`}>
        <div className={styles.timeCell}>
          <span className="shrink-0 text-base font-bold tabular-nums text-earth-900">
            {booking.slotTime}
          </span>
          {booking.people > 1 && (
            <PeopleBadge people={booking.people} size="compact" />
          )}
          {/* PR-3d：部分到店時保留原 PeopleBadge，補上「實到 N/M」醒目橘字。
              人 pill 顯示「原本預約」、annotation 顯示「實際到店」— Decision H。 */}
          {booking.people > 1 &&
            booking.attendedPeople != null &&
            booking.attendedPeople < booking.people && (
              <span className="shrink-0 text-sm font-medium text-amber-700">
                （實到 {booking.attendedPeople}/{booking.people}）
              </span>
            )}
          </div>
        <div className={styles.identityCell}><CustomerListIdentity customerId={booking.customer.id} className={styles.identityLayout} name={<span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1"><button type="button" disabled={!onClick || isActing} onClick={handleBodyClick} aria-label={`查看 ${booking.slotTime} ${booking.customer.name} 的預約詳情`} className="min-h-11 rounded text-left font-semibold focus-visible:outline-2 focus-visible:outline-primary-600">{booking.customer.name}</button>          <span className={`text-sm font-normal ${meta.variant === "danger" ? "text-red-700" : meta.variant === "warning" ? "text-amber-700" : "text-earth-500"}`}>{meta.label}</span>
          {booking.customerConfirmedAt ? (
            <span className="min-w-0 text-sm font-normal text-sky-800">
              顧客已確認會到
            </span>
          ) : null}
          {booking.recurrenceIndex && booking.recurrenceTotalOccurrences ? (
            <span className="min-w-0 text-sm font-normal text-earth-500">
              每週固定・第 {booking.recurrenceIndex}/{booking.recurrenceTotalOccurrences} 次
            </span>
          ) : null}
          {booking.bookingType === "FIRST_TRIAL" ? (
            booking.collected ? (
              <span className="min-w-0 text-sm font-normal text-earth-600">
                體驗・已收 NT${trialAmountText}
              </span>
            ) : (
              <span className="min-w-0 text-sm font-medium text-amber-800">
                體驗・未收 NT${trialAmountText}
              </span>
            )
          ) : null}
<span className={`${styles.inlineStaff} font-normal text-earth-500`}> · {assignedStaffName}</span></span>} phone={booking.customer.phone} showLabels={false} readOnly={readOnly}/></div>
        <div className={`${styles.statusCell} flex flex-wrap items-center gap-x-2 gap-y-1`}>
          {!readOnly && actionable && needsCollection && onClick && <button type="button" disabled={isActing}
            onClick={()=>onClick(booking.id,"collect")} aria-label={`收款 ${booking.customer.name} 的預約`}
            className="min-h-11 rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm font-medium text-amber-800 disabled:opacity-50">收款</button>}
          {/* 只有待到店的套餐預約才顯示目前剩餘堂數；歷史預約顯示本次
              是否已扣堂。體驗／單次不顯示方案警示。 */}
          {planBadge.kind === "remaining" ? (
            <span
              className={
                sessions.isLow
                  ? "min-w-0 text-sm font-medium text-amber-800"
                  : "shrink-0 text-sm font-medium text-earth-600"
              }
            >
              {`剩 ${planBadge.sessions} 堂`}
            </span>
          ) : planBadge.kind === "deducted" ? (
            <span title={`已扣堂｜方案：${deductedPlanLabel}`} className="block w-full min-w-0 break-words text-sm font-medium text-emerald-700">
              <span className="block">已扣堂</span>
              <span className="block font-normal">{deductedPlanLabel}</span>
            </span>
          ) : planBadge.kind === "not_deducted" ? (
            <span className="shrink-0 text-sm text-earth-500">未扣堂</span>
          ) : planBadge.kind === "needs_review" ? (
            <span className="shrink-0 rounded bg-red-50 px-1.5 py-0.5 text-sm font-medium text-red-700">
              方案待核對
            </span>
          ) : null}
        {booking.bookingType !== "FIRST_TRIAL" && planBadge.kind !== "deducted" && planLabel !== "—" ? (
          <span className={`${styles.planCell} flex w-full min-w-0 flex-col items-start gap-0 text-sm leading-relaxed text-earth-600`}>
            <span className="w-full min-w-0 [overflow-wrap:anywhere]" title={planLabel}>{planLabel}</span>
            {expiry && <span title={expiry.detail} className={`w-full min-w-0 [overflow-wrap:anywhere] ${expiry.className}`}>{expiry.compact}</span>}
          </span>
        ) : null}
        </div>
        <div className={styles.noteCell}>
          <RosterReminders customerId={booking.customer.id} name={booking.customer.name} canEdit={!readOnly}
            serviceNote={booking.customer.serviceNote} notes={booking.notes} usualLabel="平時"
            canEditNote={!readOnly && !isActing && canEditBookingNote}
            inlineNote={{ scopeKey: `${noteScope}:${booking.id}`, maxLength: 500,
              save: async (notes, expectedNotes) => {
                const result = await (onSaveBookingNote
                  ? onSaveBookingNote(booking.id, notes, expectedNotes)
                  : updateBookingNoteAction({ bookingId: booking.id, notes, expectedNotes }));
                if (result.success) onBookingNoteSaved?.(booking.id, notes);
                return result;
              },
              onSaved: () => {},
            }} />
        </div>
        <span title={assignedStaffName} className={`${styles.staffCell} text-sm text-earth-500`}>{assignedStaffName}</span>
      </div>

      <div className="relative flex w-11 shrink-0 justify-center">
        {onClick ? <RosterMoreMenu name={booking.customer.name} disabled={isActing} onOpen={handleBodyClick} /> : <Link href={`/dashboard/bookings/${booking.id}`} className="inline-flex min-h-11 items-center text-sm">查看</Link>}
      </div>
    </div>
  );
}

// 精簡單行 chip：淡底色 + 細邊框，低干擾。label 與數字同列，
// 數字依 tone 上色（未到 > 0 紅、補課 > 0 琥珀）。
function KpiChip({
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
    <span className="inline-flex min-w-0 items-center justify-between gap-1 rounded-lg border border-earth-200 bg-earth-50 px-1.5 py-1 text-sm">
      <span className="whitespace-nowrap text-earth-500">{label}</span>
      <span className={`shrink-0 whitespace-nowrap font-bold tabular-nums ${valueColor}`}>{value}</span>
    </span>
  );
}

/**
 * 該日 0 預約時的 EmptyState 文案 — 把「沒人訂」「公休」「沒設營業時段」分開講。
 *
 * 優先序：
 *   1. 篩選排除（filteredFrom > 0）→ 提示是篩選造成
 *   2. 公休 / 進修 → 不可預約，無 CTA
 *   3. 開放但 slotCount=0 → 未設營業時段，引導去設定
 *   4. 開放 + 有時段 → 「可預約（尚無預約）」+ 新增 CTA
 *   5. 不知道（daySchedule null，例如全店視角）→ 退化到舊邏輯（看 slots）
 */
function buildEmptyStateProps(input: {
  date: string;
  monthDay: string;
  filteredFrom: number | null;
  daySchedule: DayDetailPanelProps["daySchedule"];
  slotsKnown: boolean;
  slotsLoading: boolean;
  slotsError: boolean;
  slotsCount: number;
  onCreated?: () => void;
  readOnly?: boolean;
}) {
  const {
    date,
    monthDay,
    filteredFrom,
    daySchedule,
    slotsKnown,
    slotsLoading,
    slotsError,
    slotsCount,
    readOnly = false,
    onCreated,
  } = input;

  if (filteredFrom != null && filteredFrom > 0) {
    return {
      title: "沒有符合篩選的預約",
      hint: `原有 ${filteredFrom} 筆被目前篩選排除`,
      cta: undefined,
    };
  }

  if (slotsError) return { title: "時段暫時無法載入", hint: "目前無法確認可預約時段，請使用上方「重試時段」。", cta: undefined };

  if (daySchedule) {
    if (daySchedule.status === "closed") {
      return {
        title: "公休 — 不可預約",
        hint: "若需臨時開放，請至「預約開放設定」調整",
        cta: undefined,
      };
    }
    if (daySchedule.status === "training") {
      return {
        title: "進修日 — 不可預約",
        hint: "進修日期間不開放預約",
        cta: undefined,
      };
    }
    if (daySchedule.slotCount === 0) {
      return {
        title: "未設定可預約時段",
        hint: "請先到「預約開放設定」設定當日營業時間",
        cta: (
          <Link
            href="/dashboard/settings/hours"
            className="inline-flex h-8 items-center rounded-md border border-earth-300 bg-white px-3 text-sm font-medium text-earth-700 hover:bg-earth-50"
          >
            前往預約開放設定
          </Link>
        ),
      };
    }
    return {
      title: "可預約 — 尚無預約",
      hint: readOnly
        ? `${monthDay} 共 ${daySchedule.slotCount} 個可預約時段，目前尚無預約`
        : `${monthDay} 共 ${daySchedule.slotCount} 個可預約時段，點下方按鈕新增`,
      cta: readOnly ? undefined : (
        <SteamBookingDrawer date={date} triggerLabel={`＋ 新增預約於 ${monthDay}`} onCreated={onCreated}/>
      ),
    };
  }

  // 退化：daySchedule 缺席（ADMIN __all__）— 沿用既有 slots-based 提示
  return {
    title: "該日無預約",
    hint: slotsLoading || !slotsKnown
      ? "檢查當日營業時段中..."
      : slotsCount === 0
        ? "該日不營業"
        : readOnly
          ? "目前尚無預約"
          : "點上方 ＋ 新增一筆",
    cta:
      !readOnly && slotsKnown && !slotsLoading && slotsCount > 0 ? (
        <SteamBookingDrawer date={date} triggerLabel={`＋ 新增預約於 ${monthDay}`} onCreated={onCreated}/>
      ) : undefined,
  };
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
    if (b.isCheckedIn) stats.checkedIn += b.attendedPeople ?? b.people;
    if (b.bookingStatus === "COMPLETED") {
      stats.completed += b.attendedPeople ?? b.people;
      stats.noShow += Math.max(0, b.people - (b.attendedPeople ?? b.people));
    }
    if (b.bookingStatus === "NO_SHOW") stats.noShow += b.people;
    if (b.isMakeup) stats.makeup += b.people;
  }
  return stats;
}
