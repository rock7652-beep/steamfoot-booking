/**
 * 顧客合併 skeleton — 對齊實際頁面：
 *   PageShell + PageHeader → 黃色注意事項 → Step 1 表單（兩個 ID 輸入）
 */
export default function Loading() {
  return (
    <div className="mx-auto flex max-w-[1440px] animate-pulse flex-col gap-4 px-6 py-6">
      {/* PageHeader */}
      <div className="flex items-center justify-between pb-1">
        <div className="space-y-1.5">
          <div className="h-5 w-44 rounded bg-earth-200" />
          <div className="h-3 w-72 rounded bg-earth-100" />
        </div>
        <div className="h-7 w-24 rounded-md bg-earth-100" />
      </div>

      {/* 黃色注意事項 block */}
      <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="h-4 w-20 rounded bg-amber-200" />
        <div className="h-3 w-full rounded bg-amber-100" />
        <div className="h-3 w-5/6 rounded bg-amber-100" />
        <div className="h-3 w-2/3 rounded bg-amber-100" />
      </div>

      {/* Step 1 表單 */}
      <div className="rounded-lg border border-earth-200 bg-white p-4">
        <div className="h-4 w-24 rounded bg-earth-200" />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="h-3 w-32 rounded bg-earth-100" />
            <div className="h-9 w-full rounded-lg border border-earth-200 bg-white" />
          </div>
          <div className="space-y-1.5">
            <div className="h-3 w-32 rounded bg-earth-100" />
            <div className="h-9 w-full rounded-lg border border-earth-200 bg-white" />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <div className="h-7 w-24 rounded-md bg-primary-100" />
        </div>
      </div>
    </div>
  );
}
