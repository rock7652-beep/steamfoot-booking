"use client";

/**
 * 顧客 Drawer 載入骨架（PR-4）
 * 點顧客 → drawer 立即滑出時先顯示，資料到位後由 CustomerDetailDrawerContent 取代。
 * 純展示，無資料相依。
 */
export function CustomerDrawerSkeleton({
  titleId,
  loading,
  onClose,
}: {
  titleId: string;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full flex-col" aria-busy={loading}>
      <header className="sticky top-0 z-10 flex items-start justify-between border-b border-earth-100 bg-white px-5 py-4">
        <div className="min-w-0 space-y-2">
          <div id={titleId} className="h-5 w-32 animate-pulse rounded bg-earth-100" />
          <div className="h-3 w-24 animate-pulse rounded bg-earth-100" />
          <div className="h-5 w-20 animate-pulse rounded bg-earth-100" />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="關閉"
          className="ml-2 shrink-0 rounded p-1 text-earth-400 hover:bg-earth-100 hover:text-earth-700"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
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
