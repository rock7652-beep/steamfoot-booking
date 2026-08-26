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
 *
 * 檔案結構 (P1-5b 拆分後)：
 *   member-booking-form.tsx                        ← main orchestrator (此檔)
 *   _components/boundary-blocks.tsx                ← Loading / InfoBlock
 *   _components/wallet-summary-bar.tsx             ← WalletSummaryBar + WalletSummary type
 *   _components/no-wallet-card.tsx                 ← NoWalletCard
 *   _components/blocked-block.tsx                  ← BlockedBlock
 *   _components/success-card.tsx                   ← SuccessCard
 */

import { useEffect, useState, useCallback } from "react";
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
  type LiffMakeupCreditRow,
} from "@/server/actions/liff-my-wallets";
import { liffMessages } from "@/lib/liff/messages";
import { loadProfileWithSessionRefresh } from "@/lib/liff/profile-loader";
import type { SlotAvailability } from "@/types";
import {
  MonthCalendar,
  SlotPicker,
  type MonthDayInfo,
} from "@/components/liff/booking-picker";
import { InfoBlock, Loading } from "./_components/boundary-blocks";
import {
  WalletSummaryBar,
  type WalletSummary,
} from "./_components/wallet-summary-bar";
import { NoWalletCard } from "./_components/no-wallet-card";
import { BlockedBlock } from "./_components/blocked-block";
import { SuccessCard } from "./_components/success-card";
import { useBookingRequestKey } from "@/hooks/use-booking-request-key";

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
      usedMakeupCount: number;
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
  /** PR-E：per-store LINE OA 連結。 */
  contactUrl: string;
}

export function MemberBookingForm({ storeSlug, storeName, liffId, contactUrl }: Props) {
  const requestKey = useBookingRequestKey();
  const [state, setState] = useState<State>({ kind: "initializing" });
  // PR-NoShow-2：有效補課券（最早到期優先）。people=N 時券 >= N 即自動使用 N 張。
  const [makeupCredits, setMakeupCredits] = useState<LiffMakeupCreditRow[]>([]);
  // 預約人數（1~4）。
  const [people, setPeople] = useState(1);

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
        const credits = walletResult.makeupCredits;
        setMakeupCredits(credits);
        const totalAvailable = active.reduce(
          (sum, w) => sum + w.availableToBook,
          0,
        );
        // PR-NoShow-2：有有效補課券時即可預約（補課不需方案堂數）；
        // 只有「無券且無可用堂數」才擋。
        const hasMakeup = credits.length > 0;
        if (active.length === 0 && !hasMakeup) {
          setState({ kind: "no_wallet", reason: "none" });
          return;
        }
        if (totalAvailable <= 0 && !hasMakeup) {
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
        people,
        requestKey: requestKey.current(),
      });
    } catch (err) {
      console.error("[member-booking-form] action throw", err);
      setState({ kind: "service_unavailable" });
      return;
    }

    switch (result.status) {
      case "ok":
        requestKey.complete();
        setState({
          kind: "success",
          bookingDate: result.bookingDate,
          slotTime: result.slotTime,
          // 補課券是 server 自選 N 張（= people）；result.usedMakeup 為真才顯示。
          usedMakeupCount: result.usedMakeup ? people : 0,
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
      case "profile_incomplete": {
        const currentIdToken = getIDToken();
        if (!currentIdToken) {
          setState({ kind: "expired" });
          return;
        }
        const refreshed = await loadProfileWithSessionRefresh({
          idToken: currentIdToken,
          storeSlug,
        });
        if (refreshed.kind === "ok") {
          window.location.replace(
            `/s/${storeSlug}/profile?complete=1&next=${encodeURIComponent(`/s/${storeSlug}/liff/member-booking`)}`,
          );
        } else if (refreshed.kind === "need_onboarding") {
          window.location.replace(`/s/${storeSlug}/liff/onboarding`);
        } else if (refreshed.kind === "expired") {
          setState({ kind: "expired" });
        } else {
          setState({ kind: "service_unavailable" });
        }
        return;
      }
      case "no_wallet_available":
        setState({ kind: "no_wallet", reason: "none" });
        return;
      case "payment_pending":
        setState({
          kind: "blocked",
          wallet: walletCarry,
          message: liffMessages.error.paymentPending,
          showRetry: false,
          showContactStore: true,
          showDismiss: false,
        });
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
      case "store_subscription_expired":
        setState({
          kind: "blocked",
          wallet: walletCarry,
          message: "本店系統使用期限已到期，暫時無法建立新預約，請聯繫店家。",
          showRetry: false,
          showContactStore: true,
          showDismiss: false,
        });
        return;
      case "idempotency_key_reused":
        requestKey.handleError("IDEMPOTENCY_KEY_REUSED");
        setState({
          kind: "blocked",
          wallet: walletCarry,
          message: liffMessages.error.serviceUnavailable,
          showRetry: true,
          showContactStore: false,
          showDismiss: true,
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
      case "makeup_unavailable":
        // 補課券在 race 下被用掉/過期 → 提示重試（重試時若已無券會自動改用方案堂數）。
        setState({
          kind: "blocked",
          wallet: walletCarry,
          message: liffMessages.error.makeupUnavailable,
          showRetry: true,
          showContactStore: false,
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
  // 補課券不足以覆蓋人數、且方案可預約堂數也不足 → 無法成立此人數，停用送出，
  // 讓「補課資格不足」提示引導顧客改人數（避免送出後落到「沒有方案」死路）。
  const walletAvail =
    state.kind === "ready" ||
    state.kind === "submitting" ||
    state.kind === "blocked"
      ? state.wallet.totalAvailable
      : 0;
  const cannotCoverPeople =
    makeupCredits.length < people && walletAvail < people;
  const submitDisabled =
    state.kind === "submitting" ||
    !selectedDate ||
    !selectedSlot ||
    cannotCoverPeople;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
      <header className="text-center">
        <p className="text-xs uppercase tracking-widest text-earth-500">
          {storeName}
        </p>
        <h1 className="mt-1.5 text-2xl font-semibold text-earth-900">
          {liffMessages.memberBooking.title}
        </h1>
        <p className="mt-1 text-sm text-earth-600">
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

      {state.kind === "no_wallet" && (
        <NoWalletCard
          storeSlug={storeSlug}
          reason={state.reason}
          contactUrl={contactUrl}
        />
      )}

      {state.kind === "success" && (
        <SuccessCard
          storeSlug={storeSlug}
          bookingDate={state.bookingDate}
          slotTime={state.slotTime}
          usedMakeupCount={state.usedMakeupCount}
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
          {state.wallet.totalAvailable > 0 && (
            <WalletSummaryBar wallet={state.wallet} />
          )}

          {/* 預約人數選擇器（PR-NoShow-2：LIFF 也支援多人） */}
          <div className="flex items-center gap-2 rounded-xl border border-earth-200 bg-white px-4 py-2.5">
            <span className="text-sm font-semibold text-earth-800">
              {liffMessages.memberBooking.peopleLabel}
            </span>
            <button
              type="button"
              onClick={() => setPeople((p) => Math.max(1, p - 1))}
              disabled={people <= 1 || state.kind === "submitting"}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-earth-300 text-lg disabled:opacity-40"
            >
              −
            </button>
            <span className="min-w-[2rem] text-center text-xl font-bold text-earth-900">
              {people}
            </span>
            <button
              type="button"
              onClick={() => setPeople((p) => Math.min(4, p + 1))}
              disabled={people >= 4 || state.kind === "submitting"}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-earth-300 text-lg disabled:opacity-40"
            >
              +
            </button>
            <span className="ml-auto text-xs text-earth-500">
              {liffMessages.memberBooking.peopleHint}
            </span>
          </div>

          {/* 補課券：券 >= people → 自動使用 N 張；不足 → 提示改人數/用方案 */}
          {makeupCredits.length >= people && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-900">
                {liffMessages.memberBooking.makeupHint.replace(
                  "{count}",
                  String(people),
                )}
              </p>
              {makeupCredits[0].expiredAt && (
                <p className="mt-0.5 text-xs text-amber-700">
                  {liffMessages.memberBooking.makeupHintExpiry.replace(
                    "{date}",
                    makeupCredits[0].expiredAt.split("-").join("/"),
                  )}
                </p>
              )}
            </div>
          )}
          {makeupCredits.length > 0 && makeupCredits.length < people && (
            <div className="rounded-xl border border-earth-200 bg-earth-50 px-4 py-3">
              <p className="text-xs text-earth-700">
                {liffMessages.memberBooking.makeupInsufficient
                  .replace("{need}", String(people))
                  .replace("{have}", String(makeupCredits.length))}
              </p>
            </div>
          )}

          <section aria-labelledby="member-booking-date-heading">
            <h2 id="member-booking-date-heading" className="mb-2 text-sm font-semibold text-earth-800">
              1. 選擇日期
            </h2>
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
              requestedPeople={people}
              compact
              labels={{
                monthPrev: liffMessages.memberBooking.monthPrev,
                monthNext: liffMessages.memberBooking.monthNext,
                weekLabels: liffMessages.memberBooking.weekLabels,
                todayLabel: liffMessages.memberBooking.todayLabel,
                closedDayLabel: liffMessages.memberBooking.closedDayLabel,
                fullDayLabel: liffMessages.memberBooking.slotFullLabel,
              }}
            />
          </section>

          {selectedDate && (
            <section aria-labelledby="member-booking-slot-heading">
              <h2 id="member-booking-slot-heading" className="mb-2 text-sm font-semibold text-earth-800">
                2. 選擇時段
              </h2>
              <SlotPicker
                date={selectedDate}
                slots={slots}
                loading={loadingSlots}
                selectedSlot={selectedSlot}
                onSelectSlot={setSelectedSlot}
                disabled={state.kind === "submitting"}
                requestedPeople={people}
                labels={{
                  loadingText: liffMessages.memberBooking.slotsLoading,
                  emptyText: liffMessages.memberBooking.noSlotsForDay,
                  pastLabel: liffMessages.memberBooking.slotPastLabel,
                  fullLabel: liffMessages.memberBooking.slotFullLabel,
                }}
              />
            </section>
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
