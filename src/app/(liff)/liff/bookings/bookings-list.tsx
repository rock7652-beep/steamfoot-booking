"use client";

/**
 * LIFF My Bookings List (PR-D2 + PR-D4A-2)
 *
 * 流程：
 *   1. mount → initLiff → isInLineClient → ready
 *   2. ready → call fetchLiffBookings → 顯示 upcoming + history tabs
 *   3. 點 upcoming card「取消此次預約」→ confirm modal → cancelLiffBooking
 *      → 成功 → refetchBookings 替換 state（card 從 upcoming 移到 history）
 *
 * 範圍（per PR-D2 + PR-D4A-2 拍板）：
 *   ✅ upcoming / history 兩 tab (D2)
 *   ✅ status badge（reuse STATUS_LABEL / STATUS_COLOR）(D2)
 *   ✅ type badge（LIFF-specific：體驗預約 / 課程 / 單次 / 補課）(D2)
 *   ✅ 服務店長（null → 整行不顯示，不 fallback「未指派」）(D2)
 *   ✅ 「需改時間請聯絡店家」hint —— 營運訊號收集器 (D2，D4A-2 保留)
 *   ✅ 「取消此次預約」按鈕 + inline confirm modal (D4A-2)
 *   ✅ < 12h cutoff → 按鈕 disabled + 子文（client-derive，mirror server 規則）(D4A-2)
 *   ❌ 金額 / 付款狀態 / reschedule / refund / push reminder
 *
 * Mobile-first：max-w-md。文案一律 `liffMessages.bookings.*` / `liffMessages.cancelBooking.*`，不寫 inline 中文。
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  initLiff,
  isInLineClient,
  getIDToken,
} from "@/lib/liff/client";
import {
  fetchLiffBookings,
  type LiffBookingRow,
} from "@/server/actions/liff-my-bookings";
import { cancelLiffBooking } from "@/server/actions/liff-cancel-booking";
import { contactStoreUrl, liffMessages } from "@/lib/liff/messages";
import { STATUS_LABEL, STATUS_COLOR } from "@/lib/booking-constants";

type State =
  | { kind: "initializing" }
  | { kind: "not_in_line_app" }
  | { kind: "expired" }
  | { kind: "service_unavailable" }
  | {
      kind: "ready";
      upcoming: LiffBookingRow[];
      history: LiffBookingRow[];
    };

type Tab = "upcoming" | "history";

interface Props {
  storeSlug: string;
  storeName: string;
  liffId: string;
}

export function BookingsList({ storeSlug, storeName, liffId }: Props) {
  const [state, setState] = useState<State>({ kind: "initializing" });
  const [tab, setTab] = useState<Tab>("upcoming");

  // PR-D4A-2 cancel modal state — null = closed
  const [cancelTarget, setCancelTarget] = useState<LiffBookingRow | null>(null);
  const [cancelStatus, setCancelStatus] = useState<
    "idle" | "submitting" | "error"
  >("idle");
  const [cancelError, setCancelError] = useState<string | null>(null);

  function openCancelModal(booking: LiffBookingRow) {
    setCancelTarget(booking);
    setCancelStatus("idle");
    setCancelError(null);
  }

  function closeCancelModal() {
    if (cancelStatus === "submitting") return; // 不允許處理中 dismiss
    setCancelTarget(null);
    setCancelStatus("idle");
    setCancelError(null);
  }

  /**
   * 取消成功後重抓列表（per D4A-2 拍板選項 c：no flicker、explicit、accurate）。
   * 失敗 silently — 不把使用者踢出 "ready" state（避免空白頁感）。
   */
  async function refetchBookings() {
    try {
      const r = await fetchLiffBookings();
      if (r.status === "ok") {
        setState({
          kind: "ready",
          upcoming: r.upcoming,
          history: r.history,
        });
      }
    } catch (err) {
      console.warn("[liff-my-bookings] refetch after cancel failed", err);
    }
  }

  async function handleConfirmCancel() {
    if (!cancelTarget) return;
    setCancelStatus("submitting");
    setCancelError(null);
    try {
      const r = await cancelLiffBooking({ bookingId: cancelTarget.id });
      if (r.status === "ok") {
        // close 在 refetch 完成前先做，讓 modal 立刻消失；卡片靠 refetch 移到 history
        setCancelTarget(null);
        setCancelStatus("idle");
        setCancelError(null);
        await refetchBookings();
        return;
      }
      setCancelStatus("error");
      setCancelError(mapCancelStatusToMessage(r.status));
    } catch (err) {
      console.warn("[liff-my-bookings] cancelLiffBooking threw", err);
      setCancelStatus("error");
      setCancelError(liffMessages.cancelBooking.errorServiceUnavailable);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // ── 1. init LIFF ──
      try {
        await initLiff(liffId);
      } catch (err) {
        if (cancelled) return;
        console.warn("[liff-my-bookings] liff.init failed", err);
        setState({ kind: "service_unavailable" });
        return;
      }
      if (cancelled) return;

      if (!isInLineClient()) {
        setState({ kind: "not_in_line_app" });
        return;
      }
      // 沒有 idToken（LINE session 失效）= expired；與 trial-booking 同處理
      const idToken = getIDToken();
      if (!idToken) {
        setState({ kind: "expired" });
        return;
      }

      // ── 2. fetch bookings ──
      // fetchLiffBookings 不收 client 參數；session 在 server side 解
      let result;
      try {
        result = await fetchLiffBookings();
      } catch (err) {
        if (cancelled) return;
        console.warn("[liff-my-bookings] fetchLiffBookings threw", err);
        setState({ kind: "service_unavailable" });
        return;
      }
      if (cancelled) return;

      if (result.status === "no_customer") {
        // session 不在 / canonical resolve null → 顧客面歸入 expired（請重新進入）
        setState({ kind: "expired" });
        return;
      }
      if (result.status === "service_unavailable") {
        setState({ kind: "service_unavailable" });
        return;
      }
      setState({
        kind: "ready",
        upcoming: result.upcoming,
        history: result.history,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [liffId]);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
      <header className="text-center">
        <p className="text-xs uppercase tracking-widest text-earth-500">
          {storeName}
        </p>
        <h1 className="mt-1 text-xl font-bold text-earth-900">
          {liffMessages.bookings.title}
        </h1>
      </header>

      {state.kind === "initializing" && (
        <Loading text={liffMessages.bookings.initializing} />
      )}
      {state.kind === "not_in_line_app" && (
        <InfoBlock
          tone="earth"
          title={liffMessages.shell.notInLineApp.title}
          body={liffMessages.shell.notInLineApp.body}
          showContactStore
          storeSlug={storeSlug}
        />
      )}
      {state.kind === "expired" && (
        <InfoBlock
          tone="yellow"
          body={liffMessages.error.expired}
          showRetry
          storeSlug={storeSlug}
        />
      )}
      {state.kind === "service_unavailable" && (
        <InfoBlock
          tone="red"
          body={liffMessages.bookings.loadFailed}
          showRetry
          showContactStore
          storeSlug={storeSlug}
        />
      )}

      {state.kind === "ready" && (
        <ReadyView
          upcoming={state.upcoming}
          history={state.history}
          tab={tab}
          onTabChange={setTab}
          storeSlug={storeSlug}
          onRequestCancel={openCancelModal}
        />
      )}

      {/* PR-D4A-2 inline cancel confirm modal — 與 BookingsList state 同層 */}
      {cancelTarget && (
        <CancelConfirmModal
          booking={cancelTarget}
          status={cancelStatus}
          errorMessage={cancelError}
          onConfirm={handleConfirmCancel}
          onDismiss={closeCancelModal}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Ready view: tabs + list + back-home
// ──────────────────────────────────────────────────────────

function ReadyView({
  upcoming,
  history,
  tab,
  onTabChange,
  storeSlug,
  onRequestCancel,
}: {
  upcoming: LiffBookingRow[];
  history: LiffBookingRow[];
  tab: Tab;
  onTabChange: (t: Tab) => void;
  storeSlug: string;
  /** PR-D4A-2：upcoming card 點「取消此次預約」時 caller 開 modal */
  onRequestCancel: (b: LiffBookingRow) => void;
}) {
  const displayed = tab === "upcoming" ? upcoming : history;
  return (
    <>
      <Tabs tab={tab} onChange={onTabChange} upcomingCount={upcoming.length} />

      {displayed.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <ul className="flex flex-col gap-3">
          {displayed.map((b) => (
            <li key={b.id}>
              <BookingCard
                booking={b}
                tab={tab}
                onRequestCancel={onRequestCancel}
              />
            </li>
          ))}
        </ul>
      )}

      <Link
        href={`/s/${storeSlug}/liff`}
        className="mt-4 inline-flex items-center justify-center rounded-xl border border-earth-300 bg-white px-4 py-2.5 text-sm font-medium text-earth-700 hover:bg-earth-50"
      >
        {liffMessages.bookings.backHomeCta}
      </Link>
    </>
  );
}

function Tabs({
  tab,
  onChange,
  upcomingCount,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
  upcomingCount: number;
}) {
  return (
    <div className="flex gap-1 border-b border-earth-200">
      <TabButton
        active={tab === "upcoming"}
        onClick={() => onChange("upcoming")}
        label={liffMessages.bookings.tabUpcoming}
        badgeCount={upcomingCount}
      />
      <TabButton
        active={tab === "history"}
        onClick={() => onChange("history")}
        label={liffMessages.bookings.tabHistory}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  badgeCount,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badgeCount?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[44px] px-4 text-base font-semibold ${
        active
          ? "border-b-2 border-earth-800 text-earth-900"
          : "text-earth-600 hover:text-earth-800"
      }`}
    >
      {label}
      {badgeCount != null && badgeCount > 0 && (
        <span className="ml-2 rounded-full bg-earth-100 px-2 py-0.5 text-sm font-semibold text-earth-800">
          {badgeCount}
        </span>
      )}
    </button>
  );
}

// ──────────────────────────────────────────────────────────
// Card
// ──────────────────────────────────────────────────────────

function BookingCard({
  booking,
  tab,
  onRequestCancel,
}: {
  booking: LiffBookingRow;
  tab: Tab;
  /** PR-D4A-2：caller 開 cancel modal；history tab 不傳 = 不顯示按鈕 */
  onRequestCancel?: (b: LiffBookingRow) => void;
}) {
  const dateLabel = formatBookingDate(booking.bookingDate);
  const isCancelled = booking.bookingStatus === "CANCELLED";
  // PR-D4A-2：只在 upcoming tab 的 non-cancelled card 顯示「取消」按鈕。
  // history tab 一律不顯示（COMPLETED / NO_SHOW / 已取消的 / 過期 PENDING 都不該再取消）。
  const showCancelControl = tab === "upcoming" && !isCancelled && !!onRequestCancel;
  const canCancel = showCancelControl ? canCancelBooking(booking) : false;
  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border border-earth-200 bg-white px-4 py-3 shadow-sm ${
        isCancelled ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-earth-900">{dateLabel}</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-earth-800">
            {booking.slotTime}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            STATUS_COLOR[booking.bookingStatus] ?? "bg-gray-100 text-gray-700"
          }`}
        >
          {STATUS_LABEL[booking.bookingStatus] ?? booking.bookingStatus}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-earth-100 px-2 py-0.5 text-xs font-medium text-earth-700">
          {liffTypeLabel(booking.bookingType, booking.isMakeup)}
        </span>
        {booking.staffName && (
          <span className="text-xs text-earth-600">
            服務店長：{booking.staffName}
          </span>
        )}
      </div>

      {!isCancelled && (
        <div className="flex flex-col gap-2 border-t border-earth-100 pt-2">
          {/* PR-D2 保留 hint —— 取消 ≠ 改時間，hint 仍然語義正確（per D4A-2 拍板選項 a）*/}
          <p className="text-xs text-earth-500">
            {liffMessages.bookings.contactStoreHint}
          </p>

          {/* PR-D4A-2：cancel control — disabled when <12h（client-derive，mirror server 規則）*/}
          {showCancelControl &&
            (canCancel ? (
              <button
                type="button"
                onClick={() => onRequestCancel!(booking)}
                className="w-full rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 active:scale-[0.98]"
              >
                {liffMessages.cancelBooking.cardCta}
              </button>
            ) : (
              <div>
                <button
                  type="button"
                  disabled
                  aria-disabled
                  className="w-full cursor-not-allowed rounded-xl border border-earth-200 bg-earth-50 px-4 py-2.5 text-sm font-medium text-earth-400"
                >
                  {liffMessages.cancelBooking.cardCta}
                </button>
                <p className="mt-1 text-center text-[11px] text-earth-500">
                  {liffMessages.cancelBooking.cardHint}
                </p>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const title =
    tab === "upcoming"
      ? liffMessages.bookings.emptyUpcomingTitle
      : liffMessages.bookings.emptyHistoryTitle;
  const body =
    tab === "upcoming"
      ? liffMessages.bookings.emptyUpcomingBody
      : liffMessages.bookings.emptyHistoryBody;
  return (
    <div className="rounded-xl border border-dashed border-earth-300 bg-white px-4 py-10 text-center">
      <p className="text-base font-semibold text-earth-900">{title}</p>
      <p className="mt-1 text-sm text-earth-600">{body}</p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

/** "YYYY-MM-DD" → "M/D (週X)" 台灣語系。 */
function formatBookingDate(yyyymmdd: string): string {
  const d = new Date(`${yyyymmdd}T00:00:00+08:00`);
  return d.toLocaleDateString("zh-TW", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Taipei",
  });
}

/**
 * PR-D4A-2：client-side cutoff 判斷，mirror src/server/actions/booking.ts:638
 * 的 12 小時規則（hoursUntilBooking < 12 → reject）。
 *
 * client 算只負責按鈕 enabled/disabled UX；最終 source of truth 仍是 server —
 * 即使 client 漏判（時鐘漂移、跨日 edge case）讓使用者按下按鈕，cancelLiffBooking
 * 也會回 cutoff_breach，modal 會顯示錯誤訊息。
 */
function canCancelBooking(b: LiffBookingRow): boolean {
  const d = new Date(`${b.bookingDate}T${b.slotTime}:00+08:00`);
  const hoursUntil = (d.getTime() - Date.now()) / (1000 * 60 * 60);
  return hoursUntil >= 12;
}

/**
 * PR-D4A-2：cancelLiffBooking discriminated-union status → 顧客面文案。
 * no_customer / invalid_input 都歸入 service_unavailable —— 顧客面不細分
 * 「身份失效」「輸入錯」這種技術細節（這兩個本 UI 也不太可能命中）。
 */
function mapCancelStatusToMessage(status: string): string {
  const m = liffMessages.cancelBooking;
  switch (status) {
    case "not_found":
      return m.errorNotFound;
    case "forbidden":
      return m.errorForbidden;
    case "cutoff_breach":
      return m.errorCutoffBreach;
    case "status_blocked":
      return m.errorStatusBlocked;
    case "no_customer":
    case "invalid_input":
    case "service_unavailable":
    default:
      return m.errorServiceUnavailable;
  }
}

/**
 * LIFF-specific booking-type 顯示。
 *   isMakeup=true 永遠優先（不論 bookingType）
 *   不 reuse BOOKING_TYPE_LABEL — 那個用「體驗 / 課程堂數」較 staff-y；
 *   LIFF 顧客語要「體驗預約 / 課程」。
 */
function liffTypeLabel(bookingType: string, isMakeup: boolean): string {
  if (isMakeup) return liffMessages.bookings.typeMakeup;
  switch (bookingType) {
    case "FIRST_TRIAL":
      return liffMessages.bookings.typeFirstTrial;
    case "PACKAGE_SESSION":
      return liffMessages.bookings.typePackage;
    case "SINGLE":
      return liffMessages.bookings.typeSingle;
    default:
      return bookingType;
  }
}

// ──────────────────────────────────────────────────────────
// Generic blocks (同 trial-booking-form 視覺風格)
// ──────────────────────────────────────────────────────────

function Loading({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-earth-200 bg-white px-4 py-8 text-center">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-earth-300 border-t-earth-700"
        aria-hidden
      />
      <p className="text-sm text-earth-600">{text}</p>
    </div>
  );
}

function InfoBlock({
  tone,
  title,
  body,
  showRetry,
  showContactStore,
  storeSlug,
}: {
  tone: "green" | "red" | "yellow" | "earth";
  title?: string;
  body: string;
  showRetry?: boolean;
  showContactStore?: boolean;
  storeSlug: string;
}) {
  const toneClasses: Record<typeof tone, string> = {
    green: "border-green-200 bg-green-50 text-green-900",
    red: "border-red-200 bg-red-50 text-red-900",
    yellow: "border-amber-200 bg-amber-50 text-amber-900",
    earth: "border-earth-200 bg-earth-50 text-earth-900",
  };
  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border px-4 py-5 text-sm ${toneClasses[tone]}`}
    >
      {title && <p className="font-medium">{title}</p>}
      <p className="text-xs break-words opacity-90">{body}</p>
      <div className="flex flex-wrap gap-2">
        {showRetry && (
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") window.location.reload();
            }}
            className="rounded-md border border-current bg-white/70 px-3 py-1.5 text-xs font-medium hover:bg-white"
          >
            {liffMessages.error.retryCta}
          </button>
        )}
        {showContactStore && (
          <a
            href={contactStoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-current bg-white/70 px-3 py-1.5 text-xs font-medium hover:bg-white"
          >
            {liffMessages.error.contactStoreCta}
          </a>
        )}
        <Link
          href={`/s/${storeSlug}/liff`}
          className="rounded-md border border-current bg-white/70 px-3 py-1.5 text-xs font-medium hover:bg-white"
        >
          {liffMessages.bookings.backHomeCta}
        </Link>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// PR-D4A-2 cancel confirm modal (inline，未抽獨立檔；per 拍板選項 a)
// ──────────────────────────────────────────────────────────

/**
 * Bottom-sheet style modal（手機友善），desktop fallback 置中。
 *   - backdrop 點擊可關閉，但 status === "submitting" 時 lock
 *   - status 三態：idle (顯示 confirm/dismiss) / submitting (按鈕 spinner +
 *     disabled) / error (額外顯示 errorMessage banner，confirm 按鈕仍可重試)
 *   - 不做 success 階段：成功瞬間 caller 已 closeCancelModal + refetch，卡片
 *     會直接從 upcoming 移到 history，視覺即是 feedback
 */
function CancelConfirmModal({
  booking,
  status,
  errorMessage,
  onConfirm,
  onDismiss,
}: {
  booking: LiffBookingRow;
  status: "idle" | "submitting" | "error";
  errorMessage: string | null;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const m = liffMessages.cancelBooking;
  const dateLabel = formatBookingDate(booking.bookingDate);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-6 sm:items-center sm:pb-0"
      onClick={(e) => {
        // backdrop click 才 dismiss；submitting 時 lock
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <h2
          id="cancel-modal-title"
          className="text-lg font-bold text-earth-900"
        >
          {m.confirmTitle}
        </h2>
        <p className="mt-2 text-sm text-earth-600">{m.confirmBody}</p>

        {/* 預約 snapshot — 顧客最後確認一下是哪一筆 */}
        <div className="mt-3 rounded-lg border border-earth-200 bg-earth-50 px-3 py-2 text-sm">
          <p className="font-semibold text-earth-900">
            {dateLabel} {booking.slotTime}
          </p>
          <p className="mt-0.5 text-xs text-earth-600">
            {liffTypeLabel(booking.bookingType, booking.isMakeup)}
          </p>
        </div>

        {status === "error" && errorMessage && (
          <p
            role="alert"
            className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {errorMessage}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onDismiss}
            disabled={status === "submitting"}
            className="flex-1 rounded-xl border border-earth-300 bg-white px-4 py-3 text-sm font-medium text-earth-700 hover:bg-earth-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {m.dismissCta}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={status === "submitting"}
            className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-wait disabled:opacity-60"
          >
            {status === "submitting" ? m.submitting : m.confirmCta}
          </button>
        </div>
      </div>
    </div>
  );
}
