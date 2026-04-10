/** Dashboard 首頁 skeleton — KPI + 今日預約 + 日曆 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse space-y-5 px-4 py-4">
      {/* Today Summary card */}
      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="flex items-start justify-between">
          <div>
            <div className="h-4 w-32 rounded bg-earth-200" />
            <div className="mt-2 h-6 w-40 rounded bg-earth-200" />
          </div>
          <div className="h-6 w-14 rounded-md bg-earth-200" />
        </div>
        {/* KPI grid */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-earth-50 px-3 py-2.5">
              <div className="h-3 w-16 rounded bg-earth-200" />
              <div className="mt-2 h-6 w-12 rounded bg-earth-200" />
            </div>
          ))}
        </div>
      </div>

      {/* Today Bookings */}
      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="mb-3 flex items-center justify-between">
          <div className="h-5 w-24 rounded bg-earth-200" />
          <div className="h-4 w-20 rounded bg-earth-200" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-earth-50 px-3 py-2.5">
              <div className="flex items-center gap-3">
                <div className="h-4 w-12 rounded bg-earth-200" />
                <div className="h-4 w-24 rounded bg-earth-200" />
              </div>
              <div className="flex gap-1">
                <div className="h-6 w-12 rounded bg-earth-200" />
                <div className="h-6 w-12 rounded bg-earth-200" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-10 rounded-xl bg-earth-100" />
        ))}
      </div>

      {/* Calendar */}
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
