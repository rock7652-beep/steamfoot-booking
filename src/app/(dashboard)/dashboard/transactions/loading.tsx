/**
 * 交易紀錄 skeleton — 對齊實際頁面：
 *   返回鏈 + 標題 → 篩選表單 → 本頁收入 banner → DataTable
 *
 * 注意：transactions 頁目前不走 PageShell / PageHeader，仍是 `<div>` 容器，
 * 這份 skeleton 對齊現況；若後續頁面改用 PageShell，此檔需同步調整。
 */
export default function Loading() {
  return (
    <div className="animate-pulse">
      {/* Header：← 首頁 + 標題 */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-3 w-12 rounded bg-earth-100" />
          <div className="h-6 w-24 rounded bg-earth-200" />
        </div>
      </div>

      {/* Filter form — 開始日期 / 結束日期 / 類型 / 店長 / 查詢 */}
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <div className="h-3 w-14 rounded bg-earth-100" />
          <div className="h-8 w-32 rounded-lg border border-earth-200 bg-white" />
        </div>
        <div className="space-y-1">
          <div className="h-3 w-14 rounded bg-earth-100" />
          <div className="h-8 w-32 rounded-lg border border-earth-200 bg-white" />
        </div>
        <div className="h-8 w-28 self-end rounded-lg border border-earth-200 bg-white" />
        <div className="h-8 w-28 self-end rounded-lg border border-earth-200 bg-white" />
        <div className="h-8 w-16 self-end rounded-lg bg-earth-100" />
      </div>

      {/* 本頁收入 banner */}
      <div className="mb-4 flex items-center gap-3 rounded-lg bg-primary-50 px-4 py-3">
        <div className="h-3.5 w-20 rounded bg-primary-100" />
        <div className="h-4 w-24 rounded bg-primary-200" />
        <div className="ml-auto h-3 w-20 rounded bg-primary-100" />
      </div>

      {/* Transactions table */}
      <div className="overflow-hidden rounded-xl border border-earth-200 bg-white shadow-sm">
        {/* thead */}
        <div className="flex items-center gap-4 border-b border-earth-200 bg-earth-50 px-4 py-3">
          <div className="h-3 w-12 rounded bg-earth-200" />
          <div className="h-3 w-12 rounded bg-earth-200" />
          <div className="h-3 w-16 rounded bg-earth-200" />
          <div className="h-3 w-16 rounded bg-earth-200" />
          <div className="h-3 w-12 rounded bg-earth-200" />
          <div className="ml-auto h-3 w-16 rounded bg-earth-200" />
        </div>
        {/* rows */}
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-earth-100 px-4 py-3 last:border-0"
          >
            <div className="h-3.5 w-20 rounded bg-earth-100" />
            <div className="h-3.5 w-24 rounded bg-earth-100" />
            <div className="h-3.5 w-28 rounded bg-earth-100" />
            <div className="h-3.5 w-16 rounded bg-earth-100" />
            <div className="h-5 w-14 rounded-md bg-earth-100" />
            <div className="ml-auto h-3.5 w-20 rounded bg-earth-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
