/** 顧客詳情 skeleton — Phase 2 桌機 8+4 detail page */
export default function Loading() {
  return (
    <div className="mx-auto flex max-w-[1440px] animate-pulse flex-col gap-4 px-6 py-6">
      {/* 麵包屑 */}
      <div className="h-3 w-28 rounded bg-earth-100" />

      {/* PageHeader */}
      <div className="flex items-center justify-between pb-1">
        <div className="space-y-1.5">
          <div className="h-5 w-32 rounded bg-earth-200" />
          <div className="h-3 w-56 rounded bg-earth-100" />
        </div>
        <div className="flex gap-1.5">
          <div className="h-7 w-24 rounded-md bg-earth-100" />
          <div className="h-7 w-20 rounded-md bg-earth-100" />
        </div>
      </div>

      {/* KpiStrip */}
      <div className="h-10 border-b border-earth-100">
        <div className="flex h-full items-center gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-3 w-14 rounded bg-earth-100" />
              <div className="h-4 w-10 rounded bg-earth-200" />
            </div>
          ))}
        </div>
      </div>

      {/* 8 + 4 main grid */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 space-y-3 lg:col-span-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-[200px] rounded-xl border border-earth-200 bg-white"
            />
          ))}
        </div>
        <aside className="col-span-12 space-y-3 lg:col-span-4">
          <div className="h-[120px] rounded-xl border border-earth-200 bg-white" />
          <div className="h-[220px] rounded-xl border border-earth-200 bg-white" />
          <div className="h-[180px] rounded-xl border border-earth-200 bg-white" />
        </aside>
      </div>

      {/* Below-fold sections */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-[120px] rounded-xl border border-earth-200 bg-white"
        />
      ))}
    </div>
  );
}
