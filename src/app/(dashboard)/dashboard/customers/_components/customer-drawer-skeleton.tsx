"use client";

import { LoadingStatus } from "@/components/loading-status";
import { CustomerLabels } from "@/components/customer-labels";
import { CustomerPhoneLink } from "@/components/customer-detail-fields";
import type { CustomerRow } from "./customers-table";

/**
 * 顧客 Drawer 載入骨架（PR-4）
 * 點顧客 → drawer 立即滑出時先顯示，資料到位後由 CustomerDetailDrawerContent 取代。
 * 純展示，無資料相依。
 */
export function CustomerDrawerSkeleton({
  titleId,
  loading,
  onClose,
  summary,
  error,
  onRetry,
}: {
  titleId: string;
  loading: boolean;
  onClose: () => void;
  summary?: Pick<CustomerRow, "id" | "name" | "phone" | "lineName">;
  error?: string | null;
  onRetry?: () => void;
}) {
  return (
    <div className="flex h-full flex-col" aria-busy={loading}>
      <header className="sticky top-0 z-10 flex items-start justify-between border-b border-earth-100 bg-white px-5 py-4">
        <div className="min-w-0 space-y-2">
          <h2 id={titleId} className="break-words text-lg font-semibold text-earth-900">{summary?.name ?? "顧客資料"}</h2>
          {summary && <>
            <CustomerPhoneLink phone={summary.phone} />
            {summary.lineName && <p className="break-words text-sm text-earth-600">LINE {summary.lineName}</p>}
            <CustomerLabels customerId={summary.id} displayOnly hideEmpty maxVisible={8} />
          </>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="關閉"
          className="ml-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded text-earth-400 hover:bg-earth-100 hover:text-earth-700"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
      {error ? <div className="space-y-3">
        <p role="alert">{error}</p>
        <button type="button" className="min-h-11 rounded border px-4 py-2" onClick={onRetry}>重新讀取</button>
      </div> : <LoadingStatus />}
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-md bg-earth-100" />
          ))}
        </div>
        <div className="space-y-2">
          <div className="h-4 w-24 animate-pulse rounded bg-earth-100" />
          <div className="h-16 animate-pulse rounded-lg bg-earth-100" />
          <div className="h-16 animate-pulse rounded-lg bg-earth-100" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-20 animate-pulse rounded bg-earth-100" />
          <div className="h-24 animate-pulse rounded-lg bg-earth-100" />
        </div>
      </div>
    </div>
  );
}
