/**
 * 推薦追蹤 skeleton — 對齊實際頁面：
 *   max-w-4xl → 麵包屑 → 標題卡 → KPI 4 連卡 → 列表 → 排行榜
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse space-y-5 px-4 py-4">
      {/* 麵包屑 */}
      <div className="h-3 w-20 rounded bg-earth-100" />

      {/* 標題卡 */}
      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="h-5 w-24 rounded bg-earth-200" />
        <div className="mt-1.5 h-3 w-56 rounded bg-earth-100" />
      </div>

      {/* KPI 4 連卡 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-earth-200 bg-white p-3 shadow-sm"
          >
            <div className="h-3 w-16 rounded bg-earth-100" />
            <div className="mt-2 h-6 w-12 rounded bg-earth-200" />
          </div>
        ))}
      </div>

      {/* 列表 section */}
      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-between">
          <div className="h-4 w-32 rounded bg-earth-200" />
          <div className="h-3 w-16 rounded bg-earth-100" />
        </div>
        <div className="mt-3 divide-y divide-earth-100">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="h-3.5 w-32 rounded bg-earth-100" />
                <div className="h-3 w-44 rounded bg-earth-100" />
              </div>
              <div className="h-5 w-14 rounded-md bg-earth-100" />
            </div>
          ))}
        </div>
      </div>

      {/* 排行榜 section */}
      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="h-4 w-24 rounded bg-earth-200" />
        <div className="mt-3 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <div className="h-6 w-6 shrink-0 rounded-full bg-earth-100" />
              <div className="h-3.5 w-32 rounded bg-earth-100" />
              <div className="ml-auto h-3.5 w-12 rounded bg-earth-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
