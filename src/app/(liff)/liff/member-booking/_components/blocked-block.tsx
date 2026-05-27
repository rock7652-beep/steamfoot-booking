"use client";

/**
 * BlockedBlock 從 member-booking-form.tsx 拆出 (P1-5b 結構拆分).
 *
 * 純 presentational：5 個 props（message / showRetry / showContactStore /
 * showDismiss / onDismiss）皆由 caller 計算；本元件不持有任何 state。
 *
 * 注意：line 內的「重新選擇」是 hardcode 中文（pre-existing 技術債，
 * 未經 `liffMessages` 集中管理）。本 PR **不修**，逐字節保留；
 * 文案集中化是另一個獨立任務。
 */

import { liffMessages } from "@/lib/liff/messages";

export function BlockedBlock({
  message,
  showRetry,
  showContactStore,
  showDismiss,
  onDismiss,
  contactUrl,
}: {
  message: string;
  showRetry: boolean;
  showContactStore: boolean;
  showDismiss: boolean;
  onDismiss: () => void;
  /** PR-E：per-store LINE OA 連結；showContactStore=true 時必填。 */
  contactUrl: string;
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
            href={contactUrl}
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
