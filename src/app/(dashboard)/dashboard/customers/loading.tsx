/** 顧客列表 skeleton — 搜尋欄 + 表格 */
export default function Loading() {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="h-6 w-24 rounded bg-earth-200" />
        <div className="flex gap-2">
          <div className="h-8 w-14 rounded-lg bg-earth-100" />
          <div className="h-8 w-16 rounded-lg bg-primary-100" />
        </div>
      </div>

      {/* Search & filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="h-8 min-w-0 flex-1 rounded-lg bg-earth-100" />
        <div className="h-8 w-24 rounded-lg bg-earth-100" />
        <div className="h-8 w-24 rounded-lg bg-earth-100" />
        <div className="h-8 w-16 rounded-lg bg-earth-100" />
      </div>

      <div className="mb-3 h-3 w-20 rounded bg-earth-100" />

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-earth-200 bg-white shadow-sm">
        {/* Header row */}
        <div className="flex gap-4 border-b border-earth-100 bg-earth-50/50 px-4 py-3">
          <div className="h-4 w-16 rounded bg-earth-200" />
          <div className="h-4 w-20 rounded bg-earth-200" />
          <div className="hidden h-4 w-32 rounded bg-earth-200 sm:block" />
          <div className="hidden h-4 w-20 rounded bg-earth-200 sm:block" />
          <div className="h-4 w-14 rounded bg-earth-200" />
          <div className="ml-auto h-4 w-16 rounded bg-earth-200" />
        </div>
        {/* Data rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-earth-100 px-4 py-3">
            <div className="h-4 w-16 rounded bg-earth-100" />
            <div className="h-4 w-24 rounded bg-earth-100" />
            <div className="hidden h-4 w-36 rounded bg-earth-100 sm:block" />
            <div className="hidden h-4 w-16 rounded bg-earth-100 sm:block" />
            <div className="h-5 w-14 rounded-md bg-earth-100" />
            <div className="ml-auto h-4 w-12 rounded bg-earth-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
