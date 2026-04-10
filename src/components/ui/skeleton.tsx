/**
 * Design System — Skeleton Components
 *
 * 統一的 loading skeleton 元件庫。
 * 規則：Loading 必須使用 skeleton，不可空白。
 * 色調：bg-earth-50 / bg-earth-100 / bg-earth-200 + animate-pulse。
 */

/** KPI 卡片 skeleton */
export function KpiSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl bg-earth-50 px-3 py-2.5">
          <div className="h-3 w-16 rounded bg-earth-200" />
          <div className="mt-2 h-6 w-12 rounded bg-earth-200" />
        </div>
      ))}
    </div>
  );
}

/** 表格 skeleton */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-earth-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex gap-4 border-b border-earth-100 bg-earth-50/50 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-4 w-20 rounded bg-earth-200" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-earth-100 px-4 py-3">
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="h-4 w-20 rounded bg-earth-100" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** SectionCard skeleton */
export function SectionSkeleton({ height = "h-32" }: { height?: string }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <div className="mb-3 flex items-center justify-between">
        <div className="h-5 w-24 rounded bg-earth-200" />
        <div className="h-4 w-20 rounded bg-earth-200" />
      </div>
      <div className={`${height} rounded-xl bg-earth-50`} />
    </div>
  );
}

/** 完整 Dashboard 頁面 skeleton */
export function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse space-y-5 px-4 py-4">
      {/* Title card */}
      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="flex items-start justify-between">
          <div>
            <div className="h-4 w-32 rounded bg-earth-200" />
            <div className="mt-2 h-6 w-40 rounded bg-earth-200" />
          </div>
          <div className="h-6 w-14 rounded-md bg-earth-200" />
        </div>
      </div>

      {/* KPI grid */}
      <KpiSkeleton count={6} />

      {/* Today bookings section */}
      <SectionSkeleton height="h-48" />

      {/* Trend section */}
      <SectionSkeleton height="h-56" />

      {/* Calendar section */}
      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="mb-3 h-5 w-24 rounded bg-earth-200" />
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-4 rounded bg-earth-100" />
          ))}
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="h-12 rounded bg-earth-50" />
          ))}
        </div>
      </div>
    </div>
  );
}
