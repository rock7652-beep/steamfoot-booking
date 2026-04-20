/** Dashboard 首頁 skeleton — PageShell + KpiStrip + 8+4 grid + summary bar */
export default function Loading() {
  return (
    <div className="mx-auto flex max-w-[1440px] animate-pulse flex-col gap-4 px-6 py-6">
      {/* PageHeader */}
      <div className="flex items-center justify-between pb-1">
        <div className="space-y-1.5">
          <div className="h-5 w-20 rounded bg-earth-200" />
          <div className="h-3 w-56 rounded bg-earth-100" />
        </div>
        <div className="h-7 w-24 rounded-md bg-primary-100" />
      </div>

      {/* KpiStrip */}
      <div className="flex h-10 items-center gap-6 border-b border-earth-100">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-3 w-14 rounded bg-earth-100" />
            <div className="h-4 w-16 rounded bg-earth-200" />
          </div>
        ))}
      </div>

      {/* 8 + 4 grid */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 lg:col-span-8">
          <div className="rounded-xl border border-earth-200 bg-white">
            <div className="flex gap-3 border-b border-earth-100 bg-earth-50 px-3 py-2">
              <div className="h-3 w-16 rounded bg-earth-200" />
              <div className="ml-auto h-3 w-20 rounded bg-earth-200" />
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex h-11 items-center gap-3 border-b border-earth-50 px-3"
              >
                <div className="h-3.5 w-14 rounded bg-earth-100" />
                <div className="h-3.5 w-24 rounded bg-earth-100" />
                <div className="ml-auto h-3 w-20 rounded bg-earth-100" />
                <div className="h-5 w-12 rounded-md bg-earth-100" />
              </div>
            ))}
          </div>
        </div>
        <aside className="col-span-12 space-y-3 lg:col-span-4">
          <div className="h-[180px] rounded-xl border border-earth-200 bg-white" />
          <div className="h-[80px] rounded-xl border border-earth-200 bg-white" />
        </aside>
      </div>

      {/* Summary bar */}
      <div className="h-14 rounded-xl border border-dashed border-earth-200 bg-earth-50/40" />
    </div>
  );
}
