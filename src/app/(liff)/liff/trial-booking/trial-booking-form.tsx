"use client";

/**
 * LIFF Trial Booking Form (PR-D1B)
 *
 * 流程（per audit §5 Option A：success 留當頁）：
 *   1. mount → initLiff → isInLineClient → ready (顯示月曆 + slot picker)
 *   2. 選日 → fetchDaySlots → 顯示 slot 列表
 *   3. 選 slot → submit → submitLiffTrialBooking
 *      - ok → success card (留當頁，顧客點「回首頁」回 LiffShell)
 *      - already_has_trial → existing booking card + 聯繫店家 / 回首頁
 *      - slot_full / slot_unavailable → 阻擋當下提交 + reload slots（讓顧客重選）
 *      - booking_limit_reached → 全頁阻擋 + 聯繫店家
 *      - no_customer → 阻擋 + 重新登入
 *      - service_unavailable / invalid_input → 阻擋 + 重試 / 聯繫店家
 *
 * Mobile-first：max-w-md / min-h-[44px] tap target / 月曆 cell min-h-[72px]。
 *
 * 不做：
 *   - 不直接呼 createBooking（透過 submitLiffTrialBooking）
 *   - 不傳 expectedAmount / customerPlanWalletId / people（per PR-D1 audit §14）
 *   - 不接 cancel / reschedule（PR-D4）
 *   - 不寫 inline 中文（一律從 liffMessages.trialBooking.* / liffMessages.error.*）
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  initLiff,
  isInLineClient,
  getIDToken,
  LiffInitError,
} from "@/lib/liff/client";
import {
  fetchMonthAvailability,
  fetchDaySlots,
} from "@/server/actions/slots";
import {
  submitLiffTrialBooking,
  type SubmitLiffTrialBookingResult,
} from "@/server/actions/liff-trial-booking";
import { liffMessages } from "@/lib/liff/messages";
import { parseLocalDate, formatWeekdayZh } from "@/lib/date-utils";
import type { SlotAvailability } from "@/types";
import {
  MonthCalendar,
  SlotPicker,
  type MonthDayInfo,
} from "@/components/liff/booking-picker";

type State =
  | { kind: "initializing" }
  | { kind: "not_in_line_app" }
  | { kind: "expired" }
  | { kind: "service_unavailable" }
  | { kind: "ready" }
  | { kind: "submitting" }
  | {
      kind: "success";
      bookingDate: string;
      slotTime: string;
    }
  | {
      kind: "already_has_trial";
      existingBookingDate: string;
      existingSlotTime: string;
    }
  | {
      kind: "blocked";
      message: string;
      showRetry: boolean;
      showContactStore: boolean;
      showDismiss: boolean;
    };

interface Props {
  storeSlug: string;
  storeName: string;
  liffId: string;
  /** PR-E：per-store LINE OA 連結（server resolveStorePresentation 注入）。 */
  contactUrl: string;
}

export function TrialBookingForm({ storeSlug, storeName, liffId, contactUrl }: Props) {
  const [state, setState] = useState<State>({ kind: "initializing" });

  // calendar state — 台灣今日（client clock；server gate 才是 source of truth）
  const today = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth()); // 0-based
  const [monthData, setMonthData] = useState<Record<string, MonthDayInfo>>({});
  const [loadingMonth, setLoadingMonth] = useState(false);

  // day + slot selection
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotAvailability[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  // ── 1. mount: init LIFF ────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initLiff(liffId);
        if (cancelled) return;
        if (!isInLineClient()) {
          setState({ kind: "not_in_line_app" });
          return;
        }
        // PR-D1A submitLiffTrialBooking 不需 idToken（用 NextAuth session cookie）
        // 這裡只用 getIDToken 順便判斷 session 是否完整；null 視為登入逾時
        const idToken = getIDToken();
        if (!idToken) {
          setState({ kind: "expired" });
          return;
        }
        setState({ kind: "ready" });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof LiffInitError) {
          console.warn("[trial-booking-form] liff.init failed", err.message);
        } else {
          console.warn("[trial-booking-form] liff.init unexpected", err);
        }
        setState({ kind: "service_unavailable" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [liffId]);

  // ── 2. load month data ─────────────────────────────
  const monthLoadable =
    state.kind === "ready" ||
    state.kind === "submitting" ||
    state.kind === "blocked";

  useEffect(() => {
    if (!monthLoadable) return;
    let cancelled = false;
    setLoadingMonth(true);
    (async () => {
      try {
        const result = await fetchMonthAvailability(calYear, calMonth + 1);
        if (cancelled) return;
        setMonthData(result.days);
      } catch (err) {
        if (cancelled) return;
        console.warn("[trial-booking-form] fetchMonthAvailability failed", err);
        setMonthData({});
      } finally {
        if (!cancelled) setLoadingMonth(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [calYear, calMonth, monthLoadable]);

  // ── 3. load slots when date selected ───────────────
  const loadSlots = useCallback(async (date: string) => {
    setLoadingSlots(true);
    setSlots([]);
    try {
      const result = await fetchDaySlots(date);
      setSlots(result.slots);
    } catch (err) {
      console.warn("[trial-booking-form] fetchDaySlots failed", err);
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  function handleSelectDate(dateStr: string) {
    setSelectedDate(dateStr);
    setSelectedSlot(null);
    void loadSlots(dateStr);
  }

  function handlePrevMonth() {
    const nd = new Date(calYear, calMonth - 1, 1);
    setCalYear(nd.getFullYear());
    setCalMonth(nd.getMonth());
    setSelectedDate(null);
    setSlots([]);
    setSelectedSlot(null);
  }

  function handleNextMonth() {
    const nd = new Date(calYear, calMonth + 1, 1);
    setCalYear(nd.getFullYear());
    setCalMonth(nd.getMonth());
    setSelectedDate(null);
    setSlots([]);
    setSelectedSlot(null);
  }

  // ── 4. submit ──────────────────────────────────────
  async function handleSubmit() {
    if (!selectedDate || !selectedSlot) return;
    setState({ kind: "submitting" });

    let result: SubmitLiffTrialBookingResult;
    try {
      result = await submitLiffTrialBooking({
        bookingDate: selectedDate,
        slotTime: selectedSlot,
      });
    } catch (err) {
      console.error("[trial-booking-form] action throw", err);
      setState({ kind: "service_unavailable" });
      return;
    }

    switch (result.status) {
      case "ok":
        setState({
          kind: "success",
          bookingDate: result.bookingDate,
          slotTime: result.slotTime,
        });
        return;
      case "already_has_trial":
        setState({
          kind: "already_has_trial",
          existingBookingDate: result.existingBookingDate,
          existingSlotTime: result.existingSlotTime,
        });
        return;
      case "invalid_input":
        setState({
          kind: "blocked",
          message: liffMessages.error.serviceUnavailable,
          showRetry: true,
          showContactStore: true,
          showDismiss: false,
        });
        return;
      case "no_customer":
        setState({
          kind: "blocked",
          message: liffMessages.error.sessionLost,
          showRetry: true,
          showContactStore: false,
          showDismiss: false,
        });
        return;
      case "slot_full":
        // reload slots 讓顧客重新選；user can dismiss + 重選
        if (selectedDate) void loadSlots(selectedDate);
        setSelectedSlot(null);
        setState({
          kind: "blocked",
          message: liffMessages.error.slotFull,
          showRetry: false,
          showContactStore: false,
          showDismiss: true,
        });
        return;
      case "slot_unavailable":
        if (selectedDate) void loadSlots(selectedDate);
        setSelectedSlot(null);
        setState({
          kind: "blocked",
          message: liffMessages.error.slotUnavailable,
          showRetry: false,
          showContactStore: false,
          showDismiss: true,
        });
        return;
      case "booking_limit_reached":
        setState({
          kind: "blocked",
          message: liffMessages.error.bookingLimitReached,
          showRetry: false,
          showContactStore: true,
          showDismiss: false,
        });
        return;
      case "store_subscription_expired":
        setState({
          kind: "blocked",
          message: "本店系統使用期限已到期，暫時無法建立新預約，請聯繫店家。",
          showRetry: false,
          showContactStore: true,
          showDismiss: false,
        });
        return;
      case "service_unavailable":
        setState({
          kind: "blocked",
          message: liffMessages.error.serviceUnavailable,
          showRetry: true,
          showContactStore: true,
          showDismiss: true,
        });
        return;
    }
  }

  function handleDismissBlocked() {
    setState({ kind: "ready" });
  }

  // ── render ─────────────────────────────────────────
  const submitDisabled =
    state.kind === "submitting" || !selectedDate || !selectedSlot;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 py-8">
      <header className="text-center">
        <p className="text-xs uppercase tracking-widest text-earth-500">
          {storeName}
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-earth-900">
          {liffMessages.trialBooking.title}
        </h1>
        <p className="mt-2 text-sm text-earth-600">
          {liffMessages.trialBooking.body}
        </p>
      </header>

      {state.kind === "initializing" && (
        <Loading text={liffMessages.trialBooking.initializing} />
      )}

      {state.kind === "not_in_line_app" && (
        <InfoBlock
          tone="earth"
          title={liffMessages.shell.notInLineApp.title}
          body={liffMessages.shell.notInLineApp.body}
          showContactStore
          contactUrl={contactUrl}
        />
      )}

      {state.kind === "expired" && (
        <InfoBlock
          tone="yellow"
          body={liffMessages.error.expired}
          showRetry
          contactUrl={contactUrl}
        />
      )}

      {state.kind === "service_unavailable" && (
        <InfoBlock
          tone="red"
          body={liffMessages.error.serviceUnavailable}
          showRetry
          showContactStore
          contactUrl={contactUrl}
        />
      )}

      {state.kind === "success" && (
        <SuccessCard
          storeName={storeName}
          storeSlug={storeSlug}
          bookingDate={state.bookingDate}
          slotTime={state.slotTime}
          contactUrl={contactUrl}
        />
      )}

      {state.kind === "already_has_trial" && (
        <ExistingTrialCard
          storeSlug={storeSlug}
          existingBookingDate={state.existingBookingDate}
          existingSlotTime={state.existingSlotTime}
          contactUrl={contactUrl}
        />
      )}

      {state.kind === "blocked" && (
        <BlockedBlock
          message={state.message}
          showRetry={state.showRetry}
          showContactStore={state.showContactStore}
          showDismiss={state.showDismiss}
          onDismiss={handleDismissBlocked}
          contactUrl={contactUrl}
        />
      )}

      {monthLoadable && (
        <>
          <MonthCalendar
            calYear={calYear}
            calMonth={calMonth}
            today={today}
            monthData={monthData}
            loadingMonth={loadingMonth}
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
            onPrevMonth={handlePrevMonth}
            onNextMonth={handleNextMonth}
            disabled={state.kind === "submitting"}
            labels={{
              monthPrev: liffMessages.trialBooking.monthPrev,
              monthNext: liffMessages.trialBooking.monthNext,
              weekLabels: liffMessages.trialBooking.weekLabels,
              todayLabel: liffMessages.trialBooking.todayLabel,
              closedDayLabel: liffMessages.trialBooking.closedDayLabel,
              fullDayLabel: liffMessages.trialBooking.slotFullLabel,
            }}
          />

          {selectedDate && (
            <SlotPicker
              date={selectedDate}
              slots={slots}
              loading={loadingSlots}
              selectedSlot={selectedSlot}
              onSelectSlot={setSelectedSlot}
              disabled={state.kind === "submitting"}
              labels={{
                loadingText: liffMessages.trialBooking.slotsLoading,
                emptyText: liffMessages.trialBooking.noSlotsForDay,
                pastLabel: liffMessages.trialBooking.slotPastLabel,
                fullLabel: liffMessages.trialBooking.slotFullLabel,
              }}
            />
          )}

          <button
            type="button"
            disabled={submitDisabled}
            onClick={() => void handleSubmit()}
            className="mt-2 rounded-xl bg-earth-800 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-earth-700 active:scale-[0.98] disabled:opacity-60"
          >
            {state.kind === "submitting"
              ? liffMessages.trialBooking.submitting
              : !selectedDate || !selectedSlot
                ? liffMessages.trialBooking.submitPlaceholder
                : liffMessages.trialBooking.submit}
          </button>

          <p className="text-center text-[11px] text-earth-500">
            {liffMessages.trialBooking.footnote}
          </p>
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Sub-components
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
  contactUrl,
}: {
  tone: "green" | "red" | "yellow" | "earth";
  title?: string;
  body: string;
  showRetry?: boolean;
  showContactStore?: boolean;
  /** PR-E：per-store LINE OA 連結；showContactStore=true 時必填。 */
  contactUrl: string;
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
            href={contactUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-current bg-white/70 px-3 py-1.5 text-xs font-medium hover:bg-white"
          >
            {liffMessages.error.contactStoreCta}
          </a>
        )}
      </div>
    </div>
  );
}

function BlockedBlock({
  message,
  showRetry,
  showContactStore,
  showDismiss,
  onDismiss,
  contactUrl,
}: {
  message: string;
  showRetry: boolean;
  showContactStore: boolean;
  showDismiss: boolean;
  onDismiss: () => void;
  /** PR-E：per-store LINE OA 連結；showContactStore=true 時必填。 */
  contactUrl: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-900">
      <p className="text-xs break-words">{message}</p>
      <div className="flex flex-wrap gap-2">
        {showRetry && (
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") window.location.reload();
            }}
            className="rounded-md border border-red-300 bg-white/70 px-3 py-1.5 text-xs font-medium hover:bg-white"
          >
            {liffMessages.error.retryCta}
          </button>
        )}
        {showContactStore && (
          <a
            href={contactUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-red-300 bg-white/70 px-3 py-1.5 text-xs font-medium hover:bg-white"
          >
            {liffMessages.error.contactStoreCta}
          </a>
        )}
        {showDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md border border-red-300 bg-white/70 px-3 py-1.5 text-xs font-medium hover:bg-white"
          >
            重新選擇
          </button>
        )}
      </div>
    </div>
  );
}

function SuccessCard({
  storeName,
  storeSlug,
  bookingDate,
  slotTime,
  contactUrl,
}: {
  storeName: string;
  storeSlug: string;
  bookingDate: string;
  slotTime: string;
  /** PR-E：per-store LINE OA 連結。 */
  contactUrl: string;
}) {
  const weekday = formatWeekdayZh(bookingDate);
  const d = parseLocalDate(bookingDate);
  const formattedDate = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} (${weekday})`;
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-5 text-sm text-green-900">
        <p className="text-base font-semibold">
          {liffMessages.trialBooking.successTitle}
        </p>
        <div className="mt-3 space-y-1.5 text-sm">
          <div className="flex">
            <span className="w-16 text-green-800/80">
              {liffMessages.trialBooking.successDateLabel}
            </span>
            <span className="font-medium">{formattedDate}</span>
          </div>
          <div className="flex">
            <span className="w-16 text-green-800/80">
              {liffMessages.trialBooking.successSlotLabel}
            </span>
            <span className="font-medium">{slotTime}</span>
          </div>
          <div className="flex">
            <span className="w-16 text-green-800/80">
              {liffMessages.trialBooking.successStoreLabel}
            </span>
            <span className="font-medium">{storeName}</span>
          </div>
        </div>
        <p className="mt-4 text-xs text-green-800/80">
          {liffMessages.trialBooking.successFootnote}
        </p>
      </div>
      {/* PR-D4C-0：closing the loop — primary CTA「查看我的預約」放在最上方
          讓顧客自然完成「建立 → 確認新單成立」的體感閉合。原「回首頁」降為
          secondary，仍然保留作為備用出口（不 auto-redirect，per 拍板選項 b）。*/}
      <Link
        href={`/s/${storeSlug}/liff/bookings`}
        className="inline-flex w-full items-center justify-center rounded-xl bg-earth-800 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-earth-700 active:scale-[0.98]"
      >
        {liffMessages.trialBooking.successMyBookingsCta}
      </Link>
      {/* PR-E1-1：「聯絡店家」LINE-green — 顧客若有臨時問題（停車 / 服裝 / 晚到）
          自然有出口，不用回 LINE 聊天列找店家。純 <a> 開 LINE OA，零 server。
          PR-E：href 改自 server-resolved per-store contactUrl。 */}
      <a
        href={contactUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#06C755] px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[#05b54d] active:scale-[0.98]"
      >
        <LineIcon />
        {liffMessages.trialBooking.contactStoreCta}
      </a>
      <Link
        href={`/s/${storeSlug}/liff`}
        className="inline-flex w-full items-center justify-center rounded-xl border border-earth-300 bg-white px-4 py-3 text-base font-medium text-earth-700 transition hover:bg-earth-50 active:scale-[0.98]"
      >
        {liffMessages.trialBooking.successHomeCta}
      </Link>
    </div>
  );
}

/**
 * PR-E1-1：LINE logo SVG（顧客 affordance — 看到就知道「按了會回 LINE 聊天」）。
 * 同 svg path 在 bookings-list.tsx 也 inline 一份；per 拍板「duplicate over abstraction」，
 * 兩處 SuccessCard / BookingCard 各自獨立。
 */
function LineIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
    </svg>
  );
}

function ExistingTrialCard({
  storeSlug,
  existingBookingDate,
  existingSlotTime,
  contactUrl,
}: {
  storeSlug: string;
  existingBookingDate: string;
  existingSlotTime: string;
  /** PR-E：per-store LINE OA 連結。 */
  contactUrl: string;
}) {
  const weekday = formatWeekdayZh(existingBookingDate);
  const d = parseLocalDate(existingBookingDate);
  const formattedDate = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} (${weekday})`;
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-900">
        <p className="font-medium">{liffMessages.trialBooking.existingTitle}</p>
        <div className="mt-3 space-y-1.5 text-sm">
          <div className="flex">
            <span className="w-14 text-amber-800/80">
              {liffMessages.trialBooking.existingDateLabel}
            </span>
            <span className="font-medium">{formattedDate}</span>
          </div>
          <div className="flex">
            <span className="w-14 text-amber-800/80">
              {liffMessages.trialBooking.existingSlotLabel}
            </span>
            <span className="font-medium">{existingSlotTime}</span>
          </div>
        </div>
        <p className="mt-3 text-xs text-amber-800/85">
          {liffMessages.trialBooking.existingBody}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href={contactUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 rounded-xl border border-earth-300 bg-white px-4 py-3 text-center text-base font-medium text-earth-800 hover:bg-earth-50"
        >
          {liffMessages.error.contactStoreCta}
        </a>
        <Link
          href={`/s/${storeSlug}/liff`}
          className="flex-1 rounded-xl bg-earth-800 px-4 py-3 text-center text-base font-semibold text-white hover:bg-earth-700"
        >
          {liffMessages.trialBooking.successHomeCta}
        </Link>
      </div>
    </div>
  );
}

// MonthCalendar + SlotPicker 已抽到 `@/components/liff/booking-picker`（PR-G3-pre）
// 給 /liff/trial-booking 與 /liff/member-booking (PR-G3 主體) 共用同一份元件。
