"use client";

/**
 * Loading + InfoBlock 從 member-booking-form.tsx 拆出 (P1-5b 結構拆分).
 *
 * 為何不抽 shared with liff-shell / trial-booking / bookings 等其他版本：
 *   - 各檔版本的 InfoBlock 接的 prop 略有差異
 *     （bookings 版多收 storeSlug 顯示「回首頁」Link；此版不收）
 *   - 既有 LIFF codebase 採「duplicate over abstraction」pattern
 *
 * 純 presentational：props in、JSX out，零 state、零 side effect
 * （showRetry 點擊只走 window.location.reload，不維護 state）。
 */

import { liffMessages } from "@/lib/liff/messages";

// ──────────────────────────────────────────────────────────
// Sub-components (mirror trial-booking-form)
// ──────────────────────────────────────────────────────────

export function Loading({ text }: { text: string }) {
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

export function InfoBlock({
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
