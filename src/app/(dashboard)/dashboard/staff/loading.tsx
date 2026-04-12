/** 員工列表 skeleton — 卡片式佈局 */
export default function Loading() {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="h-6 w-20 rounded bg-earth-200" />
        <div className="h-8 w-24 rounded-lg bg-primary-100" />
      </div>

      {/* Staff cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-earth-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-3 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-earth-200" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-24 rounded bg-earth-200" />
                <div className="h-3 w-16 rounded bg-earth-100" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full rounded bg-earth-100" />
              <div className="h-3 w-2/3 rounded bg-earth-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
