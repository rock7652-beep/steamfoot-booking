"use client";

/**
 * ReadyView + Tabs + TabButton + EmptyState 從 bookings-list.tsx 拆出 (P1-5a 結構拆分).
 *
 * 純 presentational：所有 state 透過 props（tab / onTabChange / upcoming / history）。
 * `Tab` type export 在這檔，給 BookingsList main + BookingCard 共用。
 */

import Link from "next/link";
import { liffMessages } from "@/lib/liff/messages";
import type { LiffBookingRow } from "@/server/actions/liff-my-bookings";
import { BookingCard } from "./booking-card";

export type Tab = "upcoming" | "history";

// ──────────────────────────────────────────────────────────
// Ready view: tabs + list + back-home
// ──────────────────────────────────────────────────────────

export function ReadyView({
  upcoming,
  history,
  tab,
  onTabChange,
  storeSlug,
  storeName,
  onRequestCancel,
  contactUrl,
  storeAddress,
  storeMapUrl,
}: {
  upcoming: LiffBookingRow[];
  history: LiffBookingRow[];
  tab: Tab;
  onTabChange: (t: Tab) => void;
  storeSlug: string;
  /** PR-E1-3：ICS event SUMMARY / 行事曆 title 用 */
  storeName: string;
  /** PR-D4A-2：upcoming card 點「取消此次預約」時 caller 開 modal */
  onRequestCancel: (b: LiffBookingRow) => void;
  /** PR-E：per-store LINE OA 連結，傳給 BookingCard。 */
  contactUrl: string;
  /** PR-E：per-store 店家地址，傳給 BookingCard。 */
  storeAddress: string;
  /** PR-E：per-store Google Maps 短網址，傳給 BookingCard。 */
  storeMapUrl: string;
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
                storeName={storeName}
                onRequestCancel={onRequestCancel}
                contactUrl={contactUrl}
                storeAddress={storeAddress}
                storeMapUrl={storeMapUrl}
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
