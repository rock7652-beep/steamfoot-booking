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
import { contactStoreUrl, liffMessages } from "@/lib/liff/messages";
import { parseLocalDate, formatWeekdayZh } from "@/lib/date-utils";
import type { SlotAvailability } from "@/types";
import type { MonthSlotInfo } from "@/server/actions/slots";

type MonthDayInfo = {
  totalCapacity: number;
  totalBooked: number;
  slots: MonthSlotInfo[];
};

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
}

export function TrialBookingForm({ storeSlug, storeName, liffId }: Props) {
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
        />
      )}

      {state.kind === "expired" && (
        <InfoBlock tone="yellow" body={liffMessages.error.expired} showRetry />
      )}

      {state.kind === "service_unavailable" && (
        <InfoBlock
          tone="red"
          body={liffMessages.error.serviceUnavailable}
          showRetry
          showContactStore
        />
      )}

      {state.kind === "success" && (
        <SuccessCard
          storeName={storeName}
          storeSlug={storeSlug}
          bookingDate={state.bookingDate}
          slotTime={state.slotTime}
        />
      )}

      {state.kind === "already_has_trial" && (
        <ExistingTrialCard
          storeSlug={storeSlug}
          existingBookingDate={state.existingBookingDate}
          existingSlotTime={state.existingSlotTime}
        />
      )}

      {state.kind === "blocked" && (
        <BlockedBlock
          message={state.message}
          showRetry={state.showRetry}
          showContactStore={state.showContactStore}
          showDismiss={state.showDismiss}
          onDismiss={handleDismissBlocked}
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
          />

          {selectedDate && (
            <SlotPicker
              date={selectedDate}
              slots={slots}
              loading={loadingSlots}
              selectedSlot={selectedSlot}
              onSelectSlot={setSelectedSlot}
              disabled={state.kind === "submitting"}
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
}: {
  tone: "green" | "red" | "yellow" | "earth";
  title?: string;
  body: string;
  showRetry?: boolean;
  showContactStore?: boolean;
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
}: {
  message: string;
  showRetry: boolean;
  showContactStore: boolean;
  showDismiss: boolean;
  onDismiss: () => void;
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
            href={contactStoreUrl}
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
}: {
  storeName: string;
  storeSlug: string;
  bookingDate: string;
  slotTime: string;
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
      <Link
        href={`/s/${storeSlug}/liff`}
        className="inline-flex w-full items-center justify-center rounded-xl bg-earth-800 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-earth-700 active:scale-[0.98]"
      >
        {liffMessages.trialBooking.successHomeCta}
      </Link>
    </div>
  );
}

function ExistingTrialCard({
  storeSlug,
  existingBookingDate,
  existingSlotTime,
}: {
  storeSlug: string;
  existingBookingDate: string;
  existingSlotTime: string;
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
          href={contactStoreUrl}
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

interface MonthCalendarProps {
  calYear: number;
  calMonth: number;
  today: Date;
  monthData: Record<string, MonthDayInfo>;
  loadingMonth: boolean;
  selectedDate: string | null;
  onSelectDate: (dateStr: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  disabled: boolean;
}

function MonthCalendar({
  calYear,
  calMonth,
  today,
  monthData,
  loadingMonth,
  selectedDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  disabled,
}: MonthCalendarProps) {
  const firstDay = new Date(calYear, calMonth, 1);
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDayOfWeek = firstDay.getDay();
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const monthLabel = `${calYear} 年 ${calMonth + 1} 月`;

  function dateStrFor(day: number) {
    return `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  function isClosedDay(dateStr: string): boolean {
    const info = monthData[dateStr];
    if (!info) return false;
    return info.totalCapacity === 0;
  }
  function isFullDay(dateStr: string): boolean {
    const info = monthData[dateStr];
    if (!info) return false;
    return info.totalCapacity > 0 && info.totalBooked >= info.totalCapacity;
  }

  return (
    <div className="rounded-2xl border border-earth-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-earth-100 px-3 py-2">
        <button
          type="button"
          onClick={onPrevMonth}
          disabled={disabled}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-earth-800 hover:bg-earth-100 transition disabled:opacity-40"
          aria-label={liffMessages.trialBooking.monthPrev}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="text-lg font-bold text-earth-900">{monthLabel}</span>
        <button
          type="button"
          onClick={onNextMonth}
          disabled={disabled}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-earth-800 hover:bg-earth-100 transition disabled:opacity-40"
          aria-label={liffMessages.trialBooking.monthNext}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-7 border-b border-earth-100 bg-earth-50">
        {liffMessages.trialBooking.weekLabels.map((w) => (
          <div
            key={w}
            className="py-2 text-center text-sm font-semibold text-earth-700"
          >
            {w}
          </div>
        ))}
      </div>

      {loadingMonth ? (
        <div className="flex items-center justify-center py-12 text-sm text-earth-500">
          <div
            className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-earth-300 border-t-earth-700"
            aria-hidden
          />
          載入中…
        </div>
      ) : (
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            if (day === null) {
              return (
                <div
                  key={`e-${i}`}
                  className="min-h-[72px] border-b border-r border-earth-100"
                />
              );
            }
            const dateObj = new Date(calYear, calMonth, day);
            dateObj.setHours(0, 0, 0, 0);
            const dateStr = dateStrFor(day);
            const isPast = dateObj < today;
            const isSelected = dateStr === selectedDate;
            const isToday = dateObj.getTime() === today.getTime();
            const closed = !isPast && isClosedDay(dateStr);
            const full = !isPast && !closed && isFullDay(dateStr);
            const cellDisabled = disabled || isPast || closed;

            return (
              <button
                key={day}
                type="button"
                disabled={cellDisabled}
                onClick={() => onSelectDate(dateStr)}
                className={`relative flex min-h-[72px] flex-col items-start border-b border-r border-earth-100 p-1.5 transition ${
                  isSelected
                    ? "bg-earth-800 text-white"
                    : isPast || closed
                      ? "bg-earth-50 text-earth-400"
                      : full
                        ? "bg-earth-50 text-earth-500"
                        : "bg-white text-earth-800 hover:bg-earth-50"
                }`}
              >
                <div className="flex w-full items-center gap-1">
                  <span className="text-base font-bold leading-none">{day}</span>
                  {isToday && !isSelected && (
                    <span className="ml-auto rounded bg-earth-200 px-1 text-[10px] font-bold leading-none text-earth-800">
                      {liffMessages.trialBooking.todayLabel}
                    </span>
                  )}
                </div>
                {closed && (
                  <span
                    className={`mt-1 rounded px-1 py-0.5 text-[10px] font-medium leading-tight ${
                      isSelected
                        ? "bg-white/20 text-white"
                        : "bg-earth-100 text-earth-600"
                    }`}
                  >
                    {liffMessages.trialBooking.closedDayLabel}
                  </span>
                )}
                {full && (
                  <span
                    className={`mt-1 rounded px-1 py-0.5 text-[10px] font-medium leading-tight ${
                      isSelected
                        ? "bg-white/20 text-white"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {liffMessages.trialBooking.slotFullLabel}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface SlotPickerProps {
  date: string;
  slots: SlotAvailability[];
  loading: boolean;
  selectedSlot: string | null;
  onSelectSlot: (slot: string) => void;
  disabled: boolean;
}

function SlotPicker({
  date,
  slots,
  loading,
  selectedSlot,
  onSelectSlot,
  disabled,
}: SlotPickerProps) {
  const dateObj = parseLocalDate(date);
  const weekday = formatWeekdayZh(date);
  const heading = `${dateObj.getMonth() + 1}/${dateObj.getDate()} (${weekday})`;

  return (
    <div className="rounded-2xl border border-earth-200 bg-white shadow-sm p-4">
      <h2 className="mb-3 text-base font-bold text-earth-900">{heading}</h2>

      {loading && (
        <div className="flex items-center justify-center py-6 text-sm text-earth-500">
          <div
            className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-earth-300 border-t-earth-700"
            aria-hidden
          />
          {liffMessages.trialBooking.slotsLoading}
        </div>
      )}

      {!loading && slots.length === 0 && (
        <p className="py-6 text-center text-sm text-earth-500">
          {liffMessages.trialBooking.noSlotsForDay}
        </p>
      )}

      {!loading && slots.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {slots.map((s) => {
            const isFull = s.available <= 0;
            const isPast = s.isPast === true;
            const isSelected = s.startTime === selectedSlot;
            const slotDisabled = disabled || isFull || isPast;
            return (
              <button
                key={s.startTime}
                type="button"
                disabled={slotDisabled}
                onClick={() => onSelectSlot(s.startTime)}
                className={`flex min-h-[52px] flex-col items-center justify-center rounded-lg border px-2 py-2 text-sm font-medium transition ${
                  isSelected
                    ? "border-earth-800 bg-earth-800 text-white"
                    : isPast
                      ? "border-earth-200 bg-earth-50 text-earth-400"
                      : isFull
                        ? "border-earth-200 bg-earth-50 text-earth-500"
                        : "border-earth-300 bg-white text-earth-800 hover:bg-earth-50 hover:border-earth-500"
                }`}
              >
                <span className="text-base leading-tight">{s.startTime}</span>
                {isPast && (
                  <span className="text-[10px] leading-tight">
                    {liffMessages.trialBooking.slotPastLabel}
                  </span>
                )}
                {!isPast && isFull && (
                  <span className="text-[10px] leading-tight">
                    {liffMessages.trialBooking.slotFullLabel}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
