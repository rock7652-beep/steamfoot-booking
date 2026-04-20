/** 報表 skeleton — Phase 2 桌機版 PageShell / KpiStrip / 兩張 DataTable */
export default function Loading() {
  return (
    <div className="mx-auto flex max-w-[1440px] animate-pulse flex-col gap-4 px-6 py-6">
      {/* PageHeader */}
      <div className="flex items-center justify-between pb-1">
        <div className="space-y-1.5">
          <div className="h-5 w-16 rounded bg-earth-200" />
          <div className="h-3 w-40 rounded bg-earth-100" />
        </div>
        <div className="flex gap-1.5">
          <div className="h-7 w-20 rounded-md bg-earth-100" />
          <div className="h-7 w-20 rounded-md bg-earth-100" />
        </div>
      </div>

      {/* Date range pills */}
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-7 w-16 rounded-full bg-earth-100" />
        ))}
      </div>

      {/* KpiStrip */}
      <div className="flex h-10 items-center gap-6 border-b border-earth-100">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-3 w-14 rounded bg-earth-100" />
            <div className="h-4 w-20 rounded bg-earth-200" />
          </div>
        ))}
      </div>

      {/* Two DataTables */}
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-earth-200 bg-white">
          <div className="flex gap-3 border-b border-earth-100 bg-earth-50 px-3 py-2">
            <div className="h-3 w-16 rounded bg-earth-200" />
            <div className="ml-auto h-3 w-20 rounded bg-earth-200" />
          </div>
          {Array.from({ length: 4 }).map((_, j) => (
            <div
              key={j}
              className="flex h-11 items-center gap-3 border-b border-earth-50 px-3"
            >
              <div className="h-3.5 w-20 rounded bg-earth-100" />
              <div className="ml-auto h-3 w-16 rounded bg-earth-100" />
              <div className="h-3 w-20 rounded bg-earth-100" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
