/** 預約管理 skeleton — 標題 + 月曆 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse space-y-4 px-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-6 w-24 rounded bg-earth-200" />
        <div className="h-8 w-20 rounded-lg bg-primary-100" />
      </div>

      {/* Calendar navigation */}
      <div className="flex items-center justify-center gap-3">
        <div className="h-8 w-8 rounded bg-earth-100" />
        <div className="h-5 w-28 rounded bg-earth-200" />
        <div className="h-8 w-8 rounded bg-earth-100" />
      </div>

      {/* Staff legend */}
      <div className="flex gap-2">
        <div className="h-5 w-16 rounded-full bg-earth-100" />
        <div className="h-5 w-20 rounded-full bg-earth-100" />
      </div>

      {/* Calendar grid */}
      <div className="overflow-hidden rounded-xl border border-earth-200 bg-white shadow-sm">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-px border-b border-earth-200 bg-earth-50">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="px-2 py-2 text-center">
              <div className="mx-auto h-3 w-4 rounded bg-earth-200" />
            </div>
          ))}
        </div>
        {/* Calendar cells */}
        {Array.from({ length: 5 }).map((_, row) => (
          <div key={row} className="grid grid-cols-7 gap-px">
            {Array.from({ length: 7 }).map((_, col) => (
              <div key={col} className="min-h-[60px] border-b border-r border-earth-100 p-1.5">
                <div className="h-4 w-5 rounded bg-earth-100" />
                {row >= 1 && row <= 3 && col >= 1 && col <= 4 && (
                  <div className="mt-1 h-3 w-full rounded bg-earth-50" />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
