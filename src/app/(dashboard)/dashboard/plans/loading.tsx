/** 服務方案列表 skeleton — 卡片佈局 */
export default function Loading() {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="h-6 w-24 rounded bg-earth-200" />
        <div className="h-8 w-24 rounded-lg bg-primary-100" />
      </div>

      {/* Plan cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-earth-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="h-5 w-28 rounded bg-earth-200" />
              <div className="h-5 w-12 rounded-md bg-earth-100" />
            </div>
            <div className="mb-3 space-y-1.5">
              <div className="h-3 w-full rounded bg-earth-100" />
              <div className="h-3 w-2/3 rounded bg-earth-100" />
            </div>
            <div className="flex items-center justify-between">
              <div className="h-5 w-16 rounded bg-earth-200" />
              <div className="h-3 w-12 rounded bg-earth-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
