/**
 * 預約管理 skeleton — 對齊實際頁面：
 *   PageShell（max-w-1440 px-6 py-6 gap-4）
 *     → PageHeader（標題 + 月份 subtitle + 「＋ 新增預約」）
 *     → BookingsManager
 *         → Toolbar（年/月切換 + 今日 + 篩選）
 *         → grid-cols-12：calendar(8) + day detail(4)
 */
export default function Loading() {
  return (
    <div className="mx-auto flex max-w-[1440px] animate-pulse flex-col gap-4 px-6 py-6">
      {/* PageHeader */}
      <div className="flex items-center justify-between pb-1">
        <div className="space-y-1.5">
          <div className="h-5 w-24 rounded bg-earth-200" />
          <div className="h-3 w-20 rounded bg-earth-100" />
        </div>
        <div className="h-7 w-24 rounded-md bg-primary-100" />
      </div>

      {/* Toolbar — 月份切換 + 今日 + 篩選 chips */}
      <div className="flex flex-wrap items-center gap-2 border-b border-earth-200 pb-3">
        <div className="flex items-center gap-1.5">
          <div className="h-7 w-7 rounded-md bg-earth-100" />
          <div className="h-5 w-20 rounded bg-earth-200" />
          <div className="h-7 w-7 rounded-md bg-earth-100" />
        </div>
        <div className="h-7 w-14 rounded-md bg-earth-100" />
        <span className="mx-1 h-4 w-px bg-earth-200" />
        <div className="h-7 w-20 rounded-md bg-earth-100" />
        <div className="h-7 w-20 rounded-md bg-earth-100" />
        <div className="h-7 w-32 rounded-md bg-earth-100" />
      </div>

      {/* 12-col grid: calendar(8) + day detail(4) */}
      <div className="grid grid-cols-12 gap-4">
        {/* Calendar */}
        <div className="col-span-12 lg:col-span-8">
          <div className="overflow-hidden rounded-xl border border-earth-200 bg-white shadow-sm">
            {/* Weekday header */}
            <div className="grid grid-cols-7 border-b border-earth-200 bg-earth-50">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="px-2 py-2 text-center">
                  <div className="mx-auto h-3 w-4 rounded bg-earth-200" />
                </div>
              ))}
            </div>
            {/* Calendar cells (5 rows × 7 cols) */}
            {Array.from({ length: 5 }).map((_, row) => (
              <div key={row} className="grid grid-cols-7">
                {Array.from({ length: 7 }).map((_, col) => (
                  <div
                    key={col}
                    className="min-h-[88px] border-b border-r border-earth-100 p-1.5 last:border-r-0"
                  >
                    <div className="h-3 w-5 rounded bg-earth-100" />
                    {/* simulate booking strips on some cells */}
                    {(row + col) % 3 === 0 && (
                      <div className="mt-1.5 space-y-1">
                        <div className="h-2.5 w-full rounded-sm bg-primary-100" />
                        <div className="h-2.5 w-3/4 rounded-sm bg-blue-100" />
                      </div>
                    )}
                    {(row + col) % 4 === 1 && (
                      <div className="mt-1.5 h-2.5 w-2/3 rounded-sm bg-earth-100" />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Day detail panel */}
        <div className="col-span-12 lg:col-span-4">
          <div className="rounded-xl border border-earth-200 bg-white shadow-sm">
            <div className="border-b border-earth-100 px-4 py-3">
              <div className="h-4 w-32 rounded bg-earth-200" />
            </div>
            <div className="space-y-2 p-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg border border-earth-100 px-3 py-2"
                >
                  <div className="h-3.5 w-12 rounded bg-earth-100" />
                  <div className="h-3.5 w-20 rounded bg-earth-100" />
                  <div className="ml-auto h-2.5 w-2.5 rounded-full bg-earth-200" />
                  <div className="h-4 w-12 rounded-md bg-earth-100" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
