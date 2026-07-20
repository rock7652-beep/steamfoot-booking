"use client";

/**
 * LIFF My Bookings List (PR-D2 + PR-D4A-2 + PR-D4B-1)
 *
 * 流程：
 *   1. mount → initLiff → isInLineClient → ready
 *   2. ready → call fetchLiffBookings → 顯示 upcoming + history tabs
 *   3. 點 upcoming card「取消此次預約」→ confirm modal → cancelLiffBooking
 *      → 成功 → refetchBookings 替換 state（card 從 upcoming 移到 history）
 *   4. (PR-D4B-1) modal 內第 3 顆 primary 按鈕「改時間」：
 *      → await cancelLiffBooking → await refetchBookings →
 *      router.push("/s/{slug}/liff/trial-booking")
 *      → 顧客在新流程裡選新時段（reuse PR-D1B trial-booking page，零改動）
 *      → 顧客體感 = 「我在改時間」；架構 = cancel + create chained
 *
 * 範圍（per PR-D2 + PR-D4A-2 + PR-D4B-1 拍板）：
 *   ✅ upcoming / history 兩 tab (D2)
 *   ✅ status badge（reuse STATUS_LABEL / STATUS_COLOR）(D2)
 *   ✅ type badge（LIFF-specific：體驗預約 / 課程 / 單次 / 補課）(D2)
 *   ✅ 服務店長（null → 整行不顯示，不 fallback「未指派」）(D2)
 *   ✅ 「需改時間請聯絡店家」hint —— 營運訊號收集器 (D2，D4A-2 保留)
 *   ✅ 「取消此次預約」按鈕 + inline confirm modal (D4A-2)
 *   ✅ < 12h cutoff → 按鈕 disabled + 子文（client-derive，mirror server 規則）(D4A-2)
 *   ✅ Modal 內「改時間」primary 按鈕：cancel + redirect trial-booking (D4B-1)
 *   ❌ 金額 / 付款狀態 / refund / push reminder
 *   ❌ 真正的 atomic reschedule semantics（不動 schema / server action）
 *   ❌ PACKAGE_SESSION / SINGLE 自助改時間（LIFF 沒 create flow，需另外設計）
 *
 * Mobile-first：max-w-md。文案一律 `liffMessages.bookings.*` / `liffMessages.cancelBooking.*`，不寫 inline 中文。
 *
 * 檔案結構 (P1-5a 拆分後)：
 *   bookings-list.tsx                              ← main orchestrator (此檔)
 *   _helpers.ts                                    ← 5 純函數
 *   _components/boundary-blocks.tsx                ← Loading / InfoBlock
 *   _components/booking-card.tsx                   ← BookingCard + 3 icons
 *   _components/cancel-confirm-modal.tsx           ← CancelConfirmModal
 *   _components/ready-view.tsx                     ← ReadyView / Tabs / EmptyState + Tab type
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  initLiff,
  isInLineClient,
  getIDToken,
} from "@/lib/liff/client";
import { liffMessages } from "@/lib/liff/messages";
import { loadProfileWithSessionRefresh } from "@/lib/liff/profile-loader";
import {
  fetchLiffBookings,
  type LiffBookingRow,
} from "@/server/actions/liff-my-bookings";
import { cancelLiffBooking } from "@/server/actions/liff-cancel-booking";
import { mapCancelStatusToMessage } from "./_helpers";
import { InfoBlock, Loading } from "./_components/boundary-blocks";
import { ReadyView, type Tab } from "./_components/ready-view";
import { CancelConfirmModal } from "./_components/cancel-confirm-modal";

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

interface Props {
  storeSlug: string;
  storeName: string;
  liffId: string;
  /** PR-E：per-store LINE OA 連結。 */
  contactUrl: string;
  /** PR-E：per-store 店家地址（顯示在 BookingCard）。 */
  storeAddress: string;
  /** PR-E：per-store Google Maps 短網址。 */
  storeMapUrl: string;
}

export function BookingsList({
  storeSlug,
  storeName,
  liffId,
  contactUrl,
  storeAddress,
  storeMapUrl,
}: Props) {
  const router = useRouter(); // PR-D4B-1：reschedule 成功後 push 到 trial-booking
  const [state, setState] = useState<State>({ kind: "initializing" });
  const [tab, setTab] = useState<Tab>("upcoming");

  // PR-D4A-2 cancel modal state — null = closed
  // PR-D4B-1 共用同一個 modal state；只是 modal 內多一顆 reschedule 按鈕
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

  async function redirectToCompletedProfile(nextPath: string) {
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
      router.replace(
        `/s/${storeSlug}/profile?complete=1&next=${encodeURIComponent(nextPath)}`,
      );
    } else if (refreshed.kind === "need_onboarding") {
      router.replace(`/s/${storeSlug}/liff/onboarding`);
    } else if (refreshed.kind === "expired") {
      setState({ kind: "expired" });
    } else {
      setState({ kind: "service_unavailable" });
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
      if (r.status === "profile_incomplete") {
        await redirectToCompletedProfile(`/s/${storeSlug}/liff/bookings`);
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

  /**
   * PR-D4B-1:「改時間」flow（per 拍板 navigation 選項 α：先 refetch 再 push）。
   *
   * 顧客體感 = 「我在改時間」；架構 = cancel + create chained。
   *
   * Order matters：
   *   1. setSubmitting → 鎖住 modal，避免雙擊
   *   2. cancelLiffBooking → 完全 reuse D4A-1，0 新 server semantics
   *   3. refetchBookings → 確保返回時 list 是對的（card 已從 upcoming 移到 history）
   *   4. router.push("/s/{slug}/liff/trial-booking") → reuse PR-D1B 既有頁面，零改動
   *   5. modal close 在 push 前做（讓 modal 不殘留）
   *
   * 失敗復原：與 handleConfirmCancel 同 — error 顯在 modal，原 booking 已 CANCELLED
   * 視同單純取消（per audit §3：等同 single cancel，狀態一致）。
   */
  async function handleConfirmReschedule() {
    if (!cancelTarget) return;
    setCancelStatus("submitting");
    setCancelError(null);
    try {
      const r = await cancelLiffBooking({ bookingId: cancelTarget.id });
      if (r.status === "ok") {
        await refetchBookings();
        setCancelTarget(null);
        setCancelStatus("idle");
        setCancelError(null);
        router.push(`/s/${storeSlug}/liff/trial-booking`);
        return;
      }
      if (r.status === "profile_incomplete") {
        await redirectToCompletedProfile(`/s/${storeSlug}/liff/bookings`);
        return;
      }
      setCancelStatus("error");
      setCancelError(mapCancelStatusToMessage(r.status));
    } catch (err) {
      console.warn("[liff-my-bookings] reschedule cancel threw", err);
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
          contactUrl={contactUrl}
        />
      )}
      {state.kind === "expired" && (
        <InfoBlock
          tone="yellow"
          body={liffMessages.error.expired}
          showRetry
          storeSlug={storeSlug}
          contactUrl={contactUrl}
        />
      )}
      {state.kind === "service_unavailable" && (
        <InfoBlock
          tone="red"
          body={liffMessages.bookings.loadFailed}
          showRetry
          showContactStore
          storeSlug={storeSlug}
          contactUrl={contactUrl}
        />
      )}

      {state.kind === "ready" && (
        <ReadyView
          upcoming={state.upcoming}
          history={state.history}
          tab={tab}
          onTabChange={setTab}
          storeSlug={storeSlug}
          storeName={storeName}
          onRequestCancel={openCancelModal}
          contactUrl={contactUrl}
          storeAddress={storeAddress}
          storeMapUrl={storeMapUrl}
        />
      )}

      {/* PR-D4A-2 inline cancel confirm modal — 與 BookingsList state 同層
          PR-D4B-1 擴：加 onConfirmReschedule，modal 內第 3 顆 primary 按鈕 */}
      {cancelTarget && (
        <CancelConfirmModal
          booking={cancelTarget}
          status={cancelStatus}
          errorMessage={cancelError}
          onConfirmCancel={handleConfirmCancel}
          onConfirmReschedule={handleConfirmReschedule}
          onDismiss={closeCancelModal}
        />
      )}
    </div>
  );
}
