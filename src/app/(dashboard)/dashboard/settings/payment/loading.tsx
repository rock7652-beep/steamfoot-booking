/**
 * 付款設定 skeleton — 對齊實際頁面：
 *   PageShell + PageHeader → PaymentSettingsForm（4 個欄位 + 提交）
 */
export default function Loading() {
  return (
    <div className="mx-auto flex max-w-[1440px] animate-pulse flex-col gap-4 px-6 py-6">
      {/* PageHeader */}
      <div className="flex items-center justify-between pb-1">
        <div className="space-y-1.5">
          <div className="h-5 w-20 rounded bg-earth-200" />
          <div className="h-3 w-72 rounded bg-earth-100" />
        </div>
        <div className="h-7 w-24 rounded-md bg-earth-100" />
      </div>

      {/* Form card */}
      <div className="rounded-xl border border-earth-200 bg-white p-5 shadow-sm">
        <div className="space-y-5">
          {/* 4 個欄位 */}
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-24 rounded bg-earth-200" />
              <div className="h-9 w-full rounded-lg border border-earth-200 bg-white" />
              <div className="h-3 w-56 rounded bg-earth-100" />
            </div>
          ))}
        </div>

        {/* 提交按鈕 */}
        <div className="mt-6 flex justify-end gap-2">
          <div className="h-8 w-20 rounded-md bg-earth-100" />
          <div className="h-8 w-24 rounded-md bg-primary-100" />
        </div>
      </div>
    </div>
  );
}
