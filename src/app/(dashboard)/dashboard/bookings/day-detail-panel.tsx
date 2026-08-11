"use client";

import { DashboardLink as Link } from "@/components/dashboard-link";
import { LinkPendingLabel } from "@/components/link-pending-label";
import { StatusBadge, bookingStatusMeta } from "@/components/admin/status-badge";
import { EmptyStateCompact } from "@/components/admin/empty-state-compact";
import { TrialBookingDrawer } from "../_components/trial-booking-drawer";
import { resolveTrialDisplayAmount } from "./compute-amount";
import { PeopleBadge } from "./people-badge";
import { remainingSessionsState } from "@/lib/remaining-sessions-label";
import type { SlotAvailability } from "@/types";

export interface DayBooking {
  id: string;
  slotTime: string;
  people: number;
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
  customer: {
    name: string;
    phone: string;
    /** 內部服務備註（後台限定）。有值時當日清單顯示一行截斷提醒。 */
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
  customerPlanWallet: { plan: { name: string } } | null;
}

/** Statuses that can still be moved to COMPLETED — defines who shows the
 *  checkbox + 「完成」 inline button. Mirrors the drawer's primary-action
 *  gate so the two stay consistent. */
const ACTIONABLE_STATUSES = new Set(["PENDING", "CONFIRMED"]);

interface DayDetailPanelProps {
  date: string | null;
  bookings: DayBooking[];
  slots: SlotAvailability[];
  /** Slots availability has been resolved for this date (cache hit or fetch
   *  finished). Used to gate the "該日不營業" hint — without it we'd flash
   *  that label briefly while slots load on first click. */
  slotsKnown?: boolean;
  /** Slots fetch is in flight for the currently selected date. Lets the
   *  empty-state branch show a soft "檢查中" instead of a wrong empty hint. */
  slotsLoading?: boolean;
  /** 該日營業狀態（從月份摘要 derive 出來）。null 代表無法判斷（例如 ADMIN
   *  全店視角無 store-specific 摘要）。用於 0 預約時的文案分流：
   *  open/custom → 「可預約（尚無預約）」；closed/training → 「不可預約 — 公休 / 進修」。 */
  daySchedule?: { status: "open" | "closed" | "training" | "custom"; slotCount: number } | null;
  /** 整個月是否完全沒有任何預約 — 控制「未選日期」時的引導文案 */
  monthHasAnyBookings?: boolean;
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
  readOnly?: boolean;
}

export function DayDetailPanel({
  date,
  bookings,
  slots,
  slotsKnown = true,
  slotsLoading = false,
  daySchedule = null,
  monthHasAnyBookings = false,
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
  readOnly = false,
}: DayDetailPanelProps) {
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

  const dateObj = new Date(date + "T00:00:00+08:00");
  const monthDay = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;

  const stats = computeStats(bookings);

  const actionableCount = bookings.filter((b) =>
    ACTIONABLE_STATUSES.has(b.bookingStatus),
  ).length;
  const selectionEnabled =
    !readOnly &&
    !!onToggleSelect &&
    !!selectedIds &&
    !!onCompleteBatch &&
    !!onClearSelection;
  const selectedCount = selectedIds?.size ?? 0;
  const allSelected =
    actionableCount > 0 && selectedCount === actionableCount;

  return (
    <div className="flex h-full flex-col">
      {/* 頂部：精簡 KPI chip 列（固定，不跟著清單捲動）。
          日期已在 Drawer 標題顯示，這裡不再重複，把高度讓給名單。
          窄版用 overflow-x-auto + whitespace-nowrap 橫向滑動，不換多排。 */}
      <div className="shrink-0 px-4 pt-3">
        <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap pb-1">
          <KpiChip label="預約" value={stats.total} />
          <KpiChip label="到店" value={stats.checkedIn} />
          <KpiChip label="完成" value={stats.completed} />
          <KpiChip
            label="未到人數"
            value={stats.noShow}
            tone={stats.noShow > 0 ? "danger" : "default"}
          />
          <KpiChip label="人數" value={stats.people} />
          <KpiChip
            label="補課"
            value={stats.makeup}
            tone={stats.makeup > 0 ? "warning" : "default"}
          />
          {filteredFrom != null && (
            <span className="ml-auto inline-flex h-[22px] shrink-0 items-center rounded-full bg-primary-50 px-2 text-[11px] font-semibold text-primary-700">
              篩選中 {stats.total}/{filteredFrom}
            </span>
          )}
        </div>
      </div>

      {/* 中段：當日清單，填滿剩餘高度並可獨立捲動 */}
      <div className="min-h-0 flex-1 p-4">
      <div className="flex h-full min-h-0 flex-col rounded-lg border border-earth-200 bg-white">
        <div className="flex items-center justify-between border-b border-earth-200 px-4 py-3">
          <h3 className="text-base font-semibold text-earth-900">今日預約</h3>
          {readOnly ? (
            <span className="text-xs font-medium text-amber-700">
              查看模式
            </span>
          ) : (
            <Link
              href={`/dashboard/bookings/new?date=${date}`}
              prefetch={false}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              ＋ 新增
            </Link>
          )}
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
                slotsCount: slots.length,
                readOnly,
              })}
            />
          </div>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto divide-y divide-earth-100">
            {bookings.map((b) => {
              const actionable = ACTIONABLE_STATUSES.has(b.bookingStatus);
              const isSelected = !!selectedIds?.has(b.id);
              const isActing = !!actingIds?.has(b.id) || batchActing;
              return (
                <li key={b.id}>
                  <TimelineItem
                    booking={b}
                    onClick={onBookingClick}
                    actionable={!readOnly && actionable}
                    selected={isSelected}
                    onToggleSelect={
                      selectionEnabled ? onToggleSelect : undefined
                    }
                    onCompleteSingle={readOnly ? undefined : onCompleteSingle}
                    isActing={isActing}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
      </div>

      {/* 底部：快速操作 sticky footer（不跟著清單捲動、不被遮住） */}
      <div className="shrink-0 border-t border-earth-200 bg-white px-4 py-3">
        {readOnly ? (
          <p className="text-xs leading-relaxed text-earth-500">
            查看模式提供完整閱讀能力，建立、完成、取消、收款與改期請由該店自行完成。
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {/* PR #312-A 止血：#311 的裸 prefetch(=true) 會 FULL-prefetch 動態頁 /bookings/new
                （連 loading.tsx 都跳過、整段 SSR 含 fetchDaySlots），Drawer 一開就背景跑兩次，
                是 production RSC 請求風暴來源。改 prefetch={false} 完全不背景打；點擊仍有
                loading.tsx 骨架即時回饋。warm 化的策略留 #312-B 再評估。 */}
            <Link
              href={`/dashboard/bookings/new?date=${date}`}
              prefetch={false}
              className="inline-flex h-8 items-center rounded-md bg-primary-600 px-3 text-sm font-semibold text-white hover:bg-primary-700"
            >
              <LinkPendingLabel>＋ 新增預約於 {monthDay}</LinkPendingLabel>
            </Link>
            <Link
              href={`/dashboard/bookings/new?date=${date}&mode=makeup`}
              prefetch={false}
              className="inline-flex h-8 items-center rounded-md border border-earth-300 bg-white px-3 text-sm font-medium text-earth-700 hover:bg-earth-50"
            >
              <LinkPendingLabel>新增補課</LinkPendingLabel>
            </Link>
            {/* 體驗 499 PR-2：從月曆空時段建立未收款體驗預約（預填日期；同一 Drawer） */}
            <TrialBookingDrawer
              preset={{ date: date ?? undefined }}
              triggerLabel="建立體驗預約"
              triggerClassName="inline-flex h-8 items-center rounded-md border border-amber-300 bg-amber-50 px-3 text-sm font-medium text-amber-800 hover:bg-amber-100"
            />
          </div>
        )}
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
  // 有效 PACKAGE 堂數提醒（複用 PR #280 顧客清單同款 helper，定義一致）。
  const sessions = remainingSessionsState(booking.customer?.validPackageSessions ?? 0);
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

  // 直屬店長 = customer.assignedStaff（不再 fallback 到 revenue/service staff）
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
  //   1) servicePlan.name — 罕見，僅在 caller 明確指定 servicePlanId 時有值
  //   2) customerPlanWallet.plan.name — 後台 PACKAGE_SESSION 正解（FEFO 綁定的 wallet）
  //   3) 補課（沒方案）→ 「補課」
  //   4) 其他 → 「—」
  const planLabel =
    booking.servicePlan?.name
    ?? booking.customerPlanWallet?.plan?.name
    ?? (booking.isMakeup ? "補課" : "—");

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

      {/* Body — opens drawer on click. Use a real button so keyboard works.
          兩排式版型：
            第一排：時間 + 顧客姓名 + 直屬店長
            第二排：預約狀態 + 本次使用方案 */}
      <button
        type="button"
        onClick={handleBodyClick}
        disabled={!onClick || isActing}
        className="flex min-w-0 flex-1 flex-col gap-1 py-2.5 text-left disabled:cursor-default"
      >
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-sm font-bold tabular-nums text-earth-900">
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
              <span className="shrink-0 text-[11px] font-medium text-amber-700">
                （實到 {booking.attendedPeople}/{booking.people}）
              </span>
            )}
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-earth-900">
            {booking.customer?.name ?? "—"}
          </span>
          <span className="shrink-0 text-xs text-earth-500">
            {assignedStaffName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge variant={meta.variant} dot={false}>
            {meta.label}
          </StatusBadge>
          {booking.customerConfirmedAt ? (
            <span className="shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-800">
              顧客已確認會到
            </span>
          ) : null}
          {booking.bookingType === "FIRST_TRIAL" ? (
            booking.collected ? (
              <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">
                體驗·已收款｜NT${trialAmountText}
              </span>
            ) : (
              <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                體驗·未收款｜NT${trialAmountText}
              </span>
            )
          ) : null}
          {/* 有效堂數提醒（緊接狀態，讀作「預約中｜剩 N 堂」）。輕量呈現：
              1–3 堂亮黃「提醒儲值」；≥4 堂淡色「剩 N 堂」；無有效方案極淡灰字。 */}
          {sessions.hasValid ? (
            <span
              className={
                sessions.isLow
                  ? "shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800"
                  : "shrink-0 text-[11px] font-medium text-earth-600"
              }
            >
              {sessions.isLow
                ? `剩 ${sessions.total} 堂｜提醒儲值`
                : `剩 ${sessions.total} 堂`}
            </span>
          ) : (
            <span className="shrink-0 text-[11px] text-earth-300">無有效方案</span>
          )}
          <span className="min-w-0 flex-1 truncate text-xs text-earth-500">
            {planLabel}
          </span>
        </div>
        {/* 內部服務備註提醒（後台限定）— 有值才顯示一行截斷，沒值不佔空間 */}
        {booking.customer?.serviceNote ? (
          <div className="flex items-center gap-1 text-[11px] text-amber-700">
            <span aria-hidden>📝</span>
            <span className="min-w-0 flex-1 truncate">
              {booking.customer.serviceNote}
            </span>
          </div>
        ) : null}
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
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-earth-200 bg-earth-50 px-2.5 py-1 text-xs">
      <span className="text-earth-500">{label}</span>
      <span className={`font-bold tabular-nums ${valueColor}`}>{value}</span>
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
  slotsCount: number;
  readOnly?: boolean;
}) {
  const {
    date,
    monthDay,
    filteredFrom,
    daySchedule,
    slotsKnown,
    slotsLoading,
    slotsCount,
    readOnly = false,
  } = input;

  if (filteredFrom != null && filteredFrom > 0) {
    return {
      title: "沒有符合篩選的預約",
      hint: `原有 ${filteredFrom} 筆被目前篩選排除`,
      cta: undefined,
    };
  }

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
        <Link
          href={`/dashboard/bookings/new?date=${date}`}
          prefetch={false}
          className="inline-flex h-8 items-center rounded-md bg-primary-600 px-3 text-sm font-medium text-white hover:bg-primary-700"
        >
          <LinkPendingLabel>＋ 新增預約於 {monthDay}</LinkPendingLabel>
        </Link>
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
        <Link
          href={`/dashboard/bookings/new?date=${date}`}
          prefetch={false}
          className="inline-flex h-8 items-center rounded-md bg-primary-600 px-3 text-sm font-medium text-white hover:bg-primary-700"
        >
          <LinkPendingLabel>＋ 新增預約於 {monthDay}</LinkPendingLabel>
        </Link>
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
    if (b.isCheckedIn) stats.checkedIn++;
    if (b.bookingStatus === "COMPLETED") stats.completed++;
    if (b.bookingStatus === "NO_SHOW") stats.noShow += b.people;
    if (b.isMakeup) stats.makeup++;
  }
  return stats;
}
