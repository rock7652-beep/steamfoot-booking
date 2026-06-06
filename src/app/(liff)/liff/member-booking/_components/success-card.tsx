"use client";

/**
 * SuccessCard 從 member-booking-form.tsx 拆出 (P1-5b 結構拆分).
 *
 * Date format (`parseLocalDate + formatWeekdayZh + padStart`) 保留 inline，
 * 不抽 helper —— 函數太短且不在他處 reuse。
 *
 * 與 trial-booking 版本差異：移除 storeName label / contactStoreCta /
 * successHomeCta；只兩顆 CTA（查看我的預約 / 回我的方案）。
 */

import Link from "next/link";
import { liffMessages } from "@/lib/liff/messages";
import { parseLocalDate, formatWeekdayZh } from "@/lib/date-utils";

// ──────────────────────────────────────────────────────────
// SuccessCard (PR-G3) — 只兩顆 CTA：查看我的預約 / 回我的方案
// 移除 trial 版本的 store label / contactStoreCta / successHomeCta
// ──────────────────────────────────────────────────────────

export function SuccessCard({
  storeSlug,
  bookingDate,
  slotTime,
  usedMakeupCount = 0,
}: {
  storeSlug: string;
  bookingDate: string;
  slotTime: string;
  /** PR-NoShow-2b：本次使用的補課券張數（>0 才顯示「不扣堂」提示）。 */
  usedMakeupCount?: number;
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
        {usedMakeupCount > 0 && (
          <p className="mt-3 text-sm font-medium text-amber-700">
            {m.successMakeupUsed.replace("{count}", String(usedMakeupCount))}
          </p>
        )}
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
