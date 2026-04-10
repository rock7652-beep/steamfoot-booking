/** 報表 skeleton — 日期選擇器 + 摘要卡 + 明細表格 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div className="h-6 w-16 rounded bg-earth-200" />
      </div>

      {/* Date range filter */}
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-8 w-20 rounded-lg bg-earth-100" />
        ))}
      </div>

      {/* Period label */}
      <div className="mt-4 mb-4 h-4 w-32 rounded bg-earth-100" />

      {/* Summary cards 2x2 */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-earth-200 bg-white p-3.5 shadow-sm">
            <div className="h-3 w-20 rounded bg-earth-100" />
            <div className="mt-2 h-6 w-24 rounded bg-earth-200" />
          </div>
        ))}
      </div>

      {/* Staff breakdown */}
      <div className="mb-6">
        <div className="mb-2 h-4 w-20 rounded bg-earth-200" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-earth-200 bg-white p-3.5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="h-4 w-20 rounded bg-earth-200" />
                <div className="h-5 w-16 rounded bg-earth-100" />
              </div>
              <div className="mt-2 flex gap-3">
                <div className="h-3 w-14 rounded bg-earth-100" />
                <div className="h-3 w-14 rounded bg-earth-100" />
                <div className="h-3 w-16 rounded bg-earth-100" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Revenue by category table */}
      <div className="mb-6">
        <div className="mb-2 h-4 w-20 rounded bg-earth-200" />
        <div className="overflow-hidden rounded-xl border border-earth-200 bg-white shadow-sm">
          <div className="flex gap-4 border-b border-earth-100 bg-earth-50/50 px-3 py-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-3 w-12 rounded bg-earth-200" />
            ))}
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-4 border-b border-earth-100 px-3 py-2.5">
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="h-4 w-14 rounded bg-earth-100" />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Export buttons */}
      <div className="mb-4">
        <div className="mb-2 h-4 w-12 rounded bg-earth-200" />
        <div className="flex gap-2">
          <div className="h-8 w-28 rounded-lg bg-earth-100" />
          <div className="h-8 w-28 rounded-lg bg-earth-100" />
        </div>
      </div>
    </div>
  );
}
