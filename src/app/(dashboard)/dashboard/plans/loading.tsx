/**
 * 服務方案 skeleton — 對齊實際頁面：
 *   PageShell → PageHeader（標題 + 「← 返回首頁」）
 *     → PlansManager
 *         → KpiStrip
 *         → Filter pills bar（上架中/全部 | 顧客可購買/僅後台 | 類別 chips | 「＋ 新增方案」）
 *         → Table（類別/方案名稱/價格/堂數/單堂均價/效期/使用中）
 */
export default function Loading() {
  return (
    <div className="mx-auto flex max-w-[1440px] animate-pulse flex-col gap-4 px-6 py-6">
      {/* PageHeader */}
      <div className="flex items-center justify-between pb-1">
        <div className="space-y-1.5">
          <div className="h-5 w-20 rounded bg-earth-200" />
          <div className="h-3 w-44 rounded bg-earth-100" />
        </div>
        <div className="h-7 w-20 rounded-md bg-earth-100" />
      </div>

      {/* KpiStrip */}
      <div className="flex h-10 items-center gap-6 border-b border-earth-100">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-3 w-14 rounded bg-earth-100" />
            <div className="h-4 w-16 rounded bg-earth-200" />
          </div>
        ))}
      </div>

      {/* Filter pills bar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-earth-200 pb-2">
        <div className="h-6 w-16 rounded-full bg-earth-100" />
        <div className="h-6 w-12 rounded-full bg-earth-100" />
        <span className="mx-1 h-4 w-px bg-earth-200" />
        <div className="h-6 w-20 rounded-full bg-earth-100" />
        <div className="h-6 w-20 rounded-full bg-earth-100" />
        <span className="mx-1 h-4 w-px bg-earth-200" />
        <div className="h-6 w-16 rounded-full bg-earth-100" />
        <div className="h-6 w-12 rounded-full bg-earth-100" />
        <div className="h-6 w-12 rounded-full bg-earth-100" />
        <div className="h-6 w-12 rounded-full bg-earth-100" />
        <div className="ml-auto h-3 w-16 rounded bg-earth-100" />
        <div className="h-7 w-24 rounded-md bg-primary-100" />
      </div>

      {/* Plans table */}
      <div className="overflow-hidden rounded-xl border border-earth-200 bg-white shadow-sm">
        {/* thead */}
        <div className="flex items-center gap-3 border-b border-earth-200 bg-earth-50 px-3 py-2">
          <div className="h-3 w-10 rounded bg-earth-200" />
          <div className="h-3 w-20 rounded bg-earth-200" />
          <div className="ml-auto h-3 w-12 rounded bg-earth-200" />
          <div className="h-3 w-12 rounded bg-earth-200" />
          <div className="h-3 w-16 rounded bg-earth-200" />
          <div className="h-3 w-12 rounded bg-earth-200" />
          <div className="h-3 w-12 rounded bg-earth-200" />
        </div>
        {/* rows */}
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-earth-100 px-3 py-3 last:border-0"
          >
            <div className="h-5 w-12 rounded-md bg-earth-100" />
            <div className="h-3.5 w-32 rounded bg-earth-100" />
            <div className="ml-auto h-3.5 w-16 rounded bg-earth-100" />
            <div className="h-3.5 w-10 rounded bg-earth-100" />
            <div className="h-3.5 w-14 rounded bg-earth-100" />
            <div className="h-3.5 w-10 rounded bg-earth-100" />
            <div className="h-5 w-10 rounded-md bg-earth-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
