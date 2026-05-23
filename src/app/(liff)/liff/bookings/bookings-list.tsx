"use client";

/**
 * LIFF My Bookings List (PR-D2)
 *
 * 流程：
 *   1. mount → initLiff → isInLineClient → ready
 *   2. ready → call fetchLiffBookings → 顯示 upcoming + history tabs
 *
 * 範圍（per PR-D2 拍板）：
 *   ✅ upcoming / history 兩 tab
 *   ✅ status badge（reuse STATUS_LABEL / STATUS_COLOR）
 *   ✅ type badge（LIFF-specific：體驗預約 / 課程 / 單次 / 補課）
 *   ✅ 服務店長（null → 整行不顯示，不 fallback「未指派」）
 *   ✅ 「需改時間請聯絡店家」hint —— 營運訊號收集器
 *   ❌ 金額 / 付款狀態 / cancel / reschedule / push reminder
 *
 * Mobile-first：max-w-md。文案一律 `liffMessages.bookings.*`，不寫 inline 中文。
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
}: {
  upcoming: LiffBookingRow[];
  history: LiffBookingRow[];
  tab: Tab;
  onTabChange: (t: Tab) => void;
  storeSlug: string;
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
              <BookingCard booking={b} />
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

function BookingCard({ booking }: { booking: LiffBookingRow }) {
  const dateLabel = formatBookingDate(booking.bookingDate);
  const isCancelled = booking.bookingStatus === "CANCELLED";
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
        <p className="border-t border-earth-100 pt-2 text-xs text-earth-500">
          {liffMessages.bookings.contactStoreHint}
        </p>
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
