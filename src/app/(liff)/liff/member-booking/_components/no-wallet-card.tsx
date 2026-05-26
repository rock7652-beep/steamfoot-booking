"use client";

/**
 * NoWalletCard 從 member-booking-form.tsx 拆出 (P1-5b 結構拆分).
 *
 * 3 種 reason 對應不同 body 文案 — reason 判定邏輯仍在 main
 * （mount init useEffect / handleSubmit 內 wallet_expired / insufficient_sessions case）。
 *
 * 純 presentational：接 storeSlug + reason；2 顆 CTA（聯絡店家 / 回我的方案）。
 */

import Link from "next/link";
import { contactStoreUrl, liffMessages } from "@/lib/liff/messages";

// ──────────────────────────────────────────────────────────
// NoWalletCard — 顯示「沒有可用方案 / 已過期 / 剩餘堂數不足」+ 聯繫店家 / 回方案
// ──────────────────────────────────────────────────────────

export function NoWalletCard({
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
