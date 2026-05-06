/**
 * 潛力名單 TOP 10 skeleton — 對齊實際頁面：
 *   max-w-4xl → 麵包屑 → 標題卡 → 排行卡片列 ×10
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse space-y-5 px-4 py-4">
      {/* 麵包屑 */}
      <div className="h-3 w-20 rounded bg-earth-100" />

      {/* 標題卡 */}
      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="h-5 w-32 rounded bg-earth-200" />
        <div className="mt-1.5 h-3 w-72 rounded bg-earth-100" />
      </div>

      {/* 排行卡片列 ×10 */}
      <ol className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <li
            key={i}
            className="rounded-2xl border border-earth-100 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center gap-3">
              {/* 排名數字 */}
              <div className="h-7 w-7 shrink-0 rounded-full bg-earth-100" />
              {/* 大頭照 */}
              <div className="h-10 w-10 shrink-0 rounded-full bg-earth-100" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 rounded bg-earth-200" />
                <div className="h-3 w-44 rounded bg-earth-100" />
              </div>
              <div className="h-5 w-14 rounded-md bg-earth-100" />
            </div>
          </li>
        ))}
      </ol>

      {/* footer note */}
      <div className="mx-auto h-3 w-56 rounded bg-earth-50" />
    </div>
  );
}
