"use client";

/** LINE booking list. Reschedule edits the original reservation through the
 * authorized customer flow; cancellation remains a separate action. */

import { refreshLiffSession } from "@/lib/liff/session-refresh";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { initLiff, isInLineClient, getIDToken } from "@/lib/liff/client";
import { liffMessages } from "@/lib/liff/messages";
import { loadProfileWithSessionRefresh } from "@/lib/liff/profile-loader";
import { fetchLiffBookings, type LiffBookingRow } from "@/server/actions/liff-my-bookings";
import { cancelLiffBooking } from "@/server/actions/liff-cancel-booking";

import type { IndustryModuleId } from "@/lib/industry-modules";
import { mapCancelStatusToMessage } from "./_helpers";
import { InfoBlock, Loading } from "./_components/boundary-blocks";
import { ReadyView, type Tab } from "./_components/ready-view";
import { CancelConfirmModal } from "./_components/cancel-confirm-modal";

type State =
  | { kind: "initializing" }
  | { kind: "not_in_line_app" }
  | { kind: "expired" }
  | { kind: "identity_review_required" }
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
  dataSource: IndustryModuleId;
  allowBrowserSession?: boolean;
}

export function BookingsList({
  storeSlug,
  storeName,
  liffId,
  contactUrl,
  storeAddress,
  storeMapUrl,
  dataSource,
  allowBrowserSession = false,
}: Props) {
  const router = useRouter();
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
    // The caller enters with the confirmation modal locked in `submitting`.
    // Dismiss it before any refresh branch changes the page-level state so an
    // expired token or exchange failure cannot leave an undismissable overlay.
    setCancelTarget(null);
    setCancelStatus("idle");
    setCancelError(null);

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

  function handleConfirmReschedule() {
    if (!cancelTarget) return;
    const bookingId = cancelTarget.id;
    setCancelTarget(null);
    setCancelStatus("idle");
    setCancelError(null);
    router.push(`/s/${storeSlug}/my-bookings/${encodeURIComponent(bookingId)}/reschedule`);
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
        {
          setState({ kind: "not_in_line_app" });
          return;
        }
      } else {
        // 沒有 idToken（LINE session 失效）= expired；與 trial-booking 同處理
        const idToken = getIDToken();
        if (!idToken) {
          setState({ kind: "expired" });
          return;
        }

        const session = await refreshLiffSession({ idToken, storeSlug });
        if (cancelled) return;
        if (session.status === "need_onboarding") {
          router.replace(`/s/${storeSlug}/liff/onboarding`);
          return;
        }
        if (session.status !== "session_created") {
          setState({ kind: session.status });
          return;
        }
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
  }, [allowBrowserSession, dataSource, liffId, storeSlug, router]);

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
      {state.kind === "identity_review_required" && (
        <InfoBlock
          tone="red"
          body={liffMessages.bookings.loadFailed}
          showContactStore
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
          bookingHref={`/s/${storeSlug}/liff/member-booking`}
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
