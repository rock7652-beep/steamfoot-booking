/**
 * Design System — Error State
 *
 * 統一的錯誤狀態元件。
 * 規則：必須提供 retry，不可顯示技術訊息。
 */

"use client";

import { DashboardLink as Link } from "@/components/dashboard-link";

interface ErrorStateProps {
  /** 錯誤標題（預設：載入失敗） */
  title?: string;
  /** 錯誤說明（預設：暫時無法取得資料，請稍後再試） */
  description?: string;
  /** 重試回呼 */
  retry?: () => void;
  /** 返回連結（預設：/dashboard） */
  backHref?: string;
}

export function ErrorState({
  title = "載入失敗",
  description = "暫時無法取得資料，請稍後再試。",
  retry,
  backHref = "/dashboard",
}: ErrorStateProps) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center px-4 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-red-500"
        >
          <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          <path d="M12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <h2 className="mb-2 text-lg font-bold text-earth-900">{title}</h2>
      <p className="mb-6 max-w-sm text-sm text-earth-500">{description}</p>
      <div className="flex gap-3">
        {retry && (
          <button
            onClick={retry}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            重試
          </button>
        )}
        <Link
          href={backHref}
          className="rounded-lg border border-earth-300 px-4 py-2 text-sm font-medium text-earth-700 hover:bg-earth-50"
        >
          回首頁
        </Link>
      </div>
    </div>
  );
}
