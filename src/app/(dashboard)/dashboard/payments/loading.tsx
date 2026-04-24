/** 待確認付款清單 skeleton */
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-4 flex items-center gap-3">
        <div className="h-4 w-12 rounded bg-earth-200" />
        <div className="h-6 w-32 rounded bg-earth-200" />
      </div>

      {/* KPI strip */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-earth-200 bg-white p-4 shadow-sm">
          <div className="h-3 w-20 rounded bg-earth-100" />
          <div className="mt-2 h-6 w-14 rounded bg-earth-200" />
        </div>
        <div className="rounded-xl border border-earth-200 bg-white p-4 shadow-sm">
          <div className="h-3 w-20 rounded bg-earth-100" />
          <div className="mt-2 h-6 w-24 rounded bg-earth-200" />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-earth-200 bg-white p-4 shadow-sm">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between border-b border-earth-100 py-3 last:border-b-0">
            <div className="space-y-2">
              <div className="h-4 w-32 rounded bg-earth-200" />
              <div className="h-3 w-48 rounded bg-earth-100" />
            </div>
            <div className="h-8 w-24 rounded-lg bg-primary-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
