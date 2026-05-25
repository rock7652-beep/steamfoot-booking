"use client";

/**
 * LIFF Member Booking Form (PR-G3)
 *
 * 流程：
 *   1. mount → initLiff → isInLineClient → fetchLiffWallets (拿 active 摘要) → ready
 *   2. 選日 → fetchDaySlots → 顯示 slot 列表
 *   3. 選 slot → submit → submitLiffMemberBooking
 *      - ok → success card (查看我的預約 / 回我的方案)
 *      - no_wallet_available / wallet_expired / insufficient_sessions
 *        → blocked + 聯繫店家
 *      - slot_full / slot_unavailable → reload slots（讓顧客重選）
 *      - booking_limit_reached → 全頁阻擋 + 聯繫店家
 *      - no_customer → 阻擋 + 重新登入
 *      - service_unavailable / invalid_input → 阻擋 + 重試 / 聯繫店家
 *
 * 與 trial-booking-form 差異（per PR-G3 spec）：
 *   - 移除 already_has_trial / ExistingTrialCard
 *   - 移除 footnote「店家會於現場收取體驗費用」（會員預約不收費）
 *   - 移除 SuccessCard 內 storeName label
 *   - 移除 successHomeCta / contactStoreCta (SuccessCard 只兩顆 CTA)
 *   - 新增 Wallet summary 摘要列：「目前可預約 X 堂」+ 多張顯示「共 N 張方案」
 *   - Submit button label 改「使用堂數預約」
 *   - SuccessCard 2 CTA：查看我的預約 / 回我的方案
 *
 * Mobile-first：max-w-md / min-h-[44px] tap target / 月曆 cell min-h-[72px]。
 * 不寫 inline 中文（一律從 liffMessages.memberBooking.* / liffMessages.error.*）。
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
  submitLiffMemberBooking,
  type SubmitLiffMemberBookingResult,
} from "@/server/actions/liff-member-booking";
import {
  fetchLiffWallets,
  type LiffWalletRow,
} from "@/server/actions/liff-my-wallets";
import { contactStoreUrl, liffMessages } from "@/lib/liff/messages";
import { parseLocalDate, formatWeekdayZh } from "@/lib/date-utils";
import type { SlotAvailability } from "@/types";
import {
  MonthCalendar,
  SlotPicker,
  type MonthDayInfo,
} from "@/components/liff/booking-picker";

type WalletSummary = {
  totalAvailable: number;
  activePlanCount: number;
};

type State =
  | { kind: "initializing" }
  | { kind: "not_in_line_app" }
  | { kind: "expired" }
  | { kind: "service_unavailable" }
  | { kind: "no_wallet"; reason: "none" | "expired" | "insufficient" }
  | { kind: "ready"; wallet: WalletSummary }
  | { kind: "submitting"; wallet: WalletSummary }
  | {
      kind: "success";
      bookingDate: string;
      slotTime: string;
    }
  | {
      kind: "blocked";
      wallet: WalletSummary;
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

export function MemberBookingForm({ storeSlug, storeName, liffId }: Props) {
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

  // ── 1. mount: init LIFF + fetch wallet summary ─────
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
        const idToken = getIDToken();
        if (!idToken) {
          setState({ kind: "expired" });
          return;
        }

        // 取會員方案摘要 — active 加總 availableToBook（不含過期 / 已用完）
        let walletResult;
        try {
          walletResult = await fetchLiffWallets();
        } catch (err) {
          if (cancelled) return;
          console.warn("[member-booking-form] fetchLiffWallets threw", err);
          setState({ kind: "service_unavailable" });
          return;
        }
        if (cancelled) return;

        if (walletResult.status === "no_customer") {
          setState({ kind: "expired" });
          return;
        }
        if (walletResult.status === "service_unavailable") {
          setState({ kind: "service_unavailable" });
          return;
        }

        const active: LiffWalletRow[] = walletResult.active;
        const totalAvailable = active.reduce(
          (sum, w) => sum + w.availableToBook,
          0,
        );
        if (active.length === 0) {
          setState({ kind: "no_wallet", reason: "none" });
          return;
        }
        if (totalAvailable <= 0) {
          setState({ kind: "no_wallet", reason: "insufficient" });
          return;
        }

        setState({
          kind: "ready",
          wallet: {
            totalAvailable,
            activePlanCount: active.length,
          },
        });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof LiffInitError) {
          console.warn("[member-booking-form] liff.init failed", err.message);
        } else {
          console.warn("[member-booking-form] liff.init unexpected", err);
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
        console.warn(
          "[member-booking-form] fetchMonthAvailability failed",
          err,
        );
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
      console.warn("[member-booking-form] fetchDaySlots failed", err);
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
    if (state.kind !== "ready" && state.kind !== "blocked") return;
    const walletCarry: WalletSummary =
      state.kind === "ready" ? state.wallet : state.wallet;
    setState({ kind: "submitting", wallet: walletCarry });

    let result: SubmitLiffMemberBookingResult;
    try {
      result = await submitLiffMemberBooking({
        bookingDate: selectedDate,
        slotTime: selectedSlot,
      });
    } catch (err) {
      console.error("[member-booking-form] action throw", err);
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
      case "invalid_input":
        setState({
          kind: "blocked",
          wallet: walletCarry,
          message: liffMessages.error.serviceUnavailable,
          showRetry: true,
          showContactStore: true,
          showDismiss: false,
        });
        return;
      case "no_customer":
        setState({
          kind: "blocked",
          wallet: walletCarry,
          message: liffMessages.error.sessionLost,
          showRetry: true,
          showContactStore: false,
          showDismiss: false,
        });
        return;
      case "no_wallet_available":
        setState({ kind: "no_wallet", reason: "none" });
        return;
      case "wallet_expired":
        setState({ kind: "no_wallet", reason: "expired" });
        return;
      case "insufficient_sessions":
        setState({ kind: "no_wallet", reason: "insufficient" });
        return;
      case "slot_full":
        if (selectedDate) void loadSlots(selectedDate);
        setSelectedSlot(null);
        setState({
          kind: "blocked",
          wallet: walletCarry,
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
          wallet: walletCarry,
          message: liffMessages.error.slotUnavailable,
          showRetry: false,
          showContactStore: false,
          showDismiss: true,
        });
        return;
      case "booking_limit_reached":
        setState({
          kind: "blocked",
          wallet: walletCarry,
          message: liffMessages.error.bookingLimitReached,
          showRetry: false,
          showContactStore: true,
          showDismiss: false,
        });
        return;
      case "service_unavailable":
        setState({
          kind: "blocked",
          wallet: walletCarry,
          message: liffMessages.error.serviceUnavailable,
          showRetry: true,
          showContactStore: true,
          showDismiss: true,
        });
        return;
    }
  }

  function handleDismissBlocked() {
    if (state.kind !== "blocked") return;
    setState({ kind: "ready", wallet: state.wallet });
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
          {liffMessages.memberBooking.title}
        </h1>
        <p className="mt-2 text-sm text-earth-600">
          {liffMessages.memberBooking.body}
        </p>
      </header>

      {state.kind === "initializing" && (
        <Loading text={liffMessages.memberBooking.initializing} />
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

      {state.kind === "no_wallet" && (
        <NoWalletCard storeSlug={storeSlug} reason={state.reason} />
      )}

      {state.kind === "success" && (
        <SuccessCard
          storeSlug={storeSlug}
          bookingDate={state.bookingDate}
          slotTime={state.slotTime}
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
          <WalletSummaryBar wallet={state.wallet} />

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
              monthPrev: liffMessages.memberBooking.monthPrev,
              monthNext: liffMessages.memberBooking.monthNext,
              weekLabels: liffMessages.memberBooking.weekLabels,
              todayLabel: liffMessages.memberBooking.todayLabel,
              closedDayLabel: liffMessages.memberBooking.closedDayLabel,
              fullDayLabel: liffMessages.memberBooking.slotFullLabel,
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
                loadingText: liffMessages.memberBooking.slotsLoading,
                emptyText: liffMessages.memberBooking.noSlotsForDay,
                pastLabel: liffMessages.memberBooking.slotPastLabel,
                fullLabel: liffMessages.memberBooking.slotFullLabel,
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
              ? liffMessages.memberBooking.submitting
              : !selectedDate || !selectedSlot
                ? liffMessages.memberBooking.submitPlaceholder
                : liffMessages.memberBooking.submit}
          </button>
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Wallet summary bar — readonly
// 「目前可預約 X 堂」+ 多張方案時加「共 N 張方案」
// ──────────────────────────────────────────────────────────

function WalletSummaryBar({ wallet }: { wallet: WalletSummary }) {
  const m = liffMessages.memberBooking;
  return (
    <div className="rounded-xl border border-earth-200 bg-earth-50 px-4 py-3 text-sm text-earth-800">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-earth-600">{m.walletSummaryPrefix}</span>
        <span>
          <strong className="text-xl font-bold tabular-nums text-earth-900">
            {wallet.totalAvailable}
          </strong>
          <span className="ml-1 text-xs text-earth-700">
            {m.walletSummarySuffix}
          </span>
        </span>
      </div>
      {wallet.activePlanCount > 1 && (
        <p className="mt-1 text-right text-[11px] text-earth-500">
          {m.walletSummaryMultiPlan.replace(
            "{count}",
            String(wallet.activePlanCount),
          )}
        </p>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// NoWalletCard — 顯示「沒有可用方案 / 已過期 / 剩餘堂數不足」+ 聯繫店家 / 回方案
// ──────────────────────────────────────────────────────────

function NoWalletCard({
  storeSlug,
  reason,
}: {
  storeSlug: string;
  reason: "none" | "expired" | "insufficient";
}) {
  const m = liffMessages.memberBooking;
  const body =
    reason === "expired"
      ? m.noWalletExpired
      : reason === "insufficient"
        ? m.noWalletInsufficient
        : m.noWalletNone;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-900">
      <p className="font-medium">{m.noWalletTitle}</p>
      <p className="text-xs break-words opacity-90">{body}</p>
      <div className="flex flex-wrap gap-2">
        <a
          href={contactStoreUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-amber-300 bg-white/70 px-3 py-1.5 text-xs font-medium hover:bg-white"
        >
          {liffMessages.error.contactStoreCta}
        </a>
        <Link
          href={`/s/${storeSlug}/liff/wallets`}
          className="rounded-md border border-amber-300 bg-white/70 px-3 py-1.5 text-xs font-medium hover:bg-white"
        >
          {m.backToWalletsCta}
        </Link>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Sub-components (mirror trial-booking-form)
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

// ──────────────────────────────────────────────────────────
// SuccessCard (PR-G3) — 只兩顆 CTA：查看我的預約 / 回我的方案
// 移除 trial 版本的 store label / contactStoreCta / successHomeCta
// ──────────────────────────────────────────────────────────

function SuccessCard({
  storeSlug,
  bookingDate,
  slotTime,
}: {
  storeSlug: string;
  bookingDate: string;
  slotTime: string;
}) {
  const m = liffMessages.memberBooking;
  const weekday = formatWeekdayZh(bookingDate);
  const d = parseLocalDate(bookingDate);
  const formattedDate = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} (${weekday})`;
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-5 text-sm text-green-900">
        <p className="text-base font-semibold">{m.successTitle}</p>
        <div className="mt-3 space-y-1.5 text-sm">
          <div className="flex">
            <span className="w-16 text-green-800/80">
              {m.successDateLabel}
            </span>
            <span className="font-medium">{formattedDate}</span>
          </div>
          <div className="flex">
            <span className="w-16 text-green-800/80">
              {m.successSlotLabel}
            </span>
            <span className="font-medium">{slotTime}</span>
          </div>
        </div>
        <p className="mt-4 text-xs text-green-800/80">
          {m.successFootnote}
        </p>
      </div>
      <Link
        href={`/s/${storeSlug}/liff/bookings`}
        className="inline-flex w-full items-center justify-center rounded-xl bg-earth-800 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-earth-700 active:scale-[0.98]"
      >
        {m.successMyBookingsCta}
      </Link>
      <Link
        href={`/s/${storeSlug}/liff/wallets`}
        className="inline-flex w-full items-center justify-center rounded-xl border border-earth-300 bg-white px-4 py-3 text-base font-medium text-earth-700 transition hover:bg-earth-50 active:scale-[0.98]"
      >
        {m.successWalletsCta}
      </Link>
    </div>
  );
}
