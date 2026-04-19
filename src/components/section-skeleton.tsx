/**
 * 統一的 section skeleton（Suspense fallback 用）
 *
 * Server component — 無狀態，純 UI shell。
 */

interface SectionSkeletonProps {
  /** 高度預設 h-24；需要更高的區塊傳入自訂 tailwind class */
  heightClass?: string;
  /** 是否顯示 header 行（像 KPI 卡 / SectionCard 標題） */
  showHeader?: boolean;
}

export function SectionSkeleton({
  heightClass = "h-24",
  showHeader = true,
}: SectionSkeletonProps) {
  return (
    <div className="rounded-2xl border border-earth-100 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      {showHeader && (
        <div className="mb-3 flex items-center gap-2">
          <div className="h-3 w-20 animate-pulse rounded bg-earth-100" />
          <div className="h-3 w-10 animate-pulse rounded bg-earth-100" />
        </div>
      )}
      <div className={`animate-pulse rounded-lg bg-earth-50 ${heightClass}`} />
    </div>
  );
}

/** KPI 卡骨架（多欄格狀用） */
export function KpiCardSkeleton() {
  return (
    <div className="rounded-xl border border-earth-100 bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="h-3 w-12 animate-pulse rounded bg-earth-100" />
      <div className="mt-2 h-6 w-16 animate-pulse rounded bg-earth-100" />
    </div>
  );
}
