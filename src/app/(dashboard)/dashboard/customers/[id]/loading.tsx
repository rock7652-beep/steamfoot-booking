/** 顧客詳情 skeleton — 資料卡 + 方案 + 預約 + 交易 */
export default function Loading() {
  return (
    <div className="max-w-4xl animate-pulse space-y-6">
      {/* Back link */}
      <div className="h-4 w-20 rounded bg-earth-100" />

      {/* Basic Info card */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-6 w-28 rounded bg-earth-200" />
              <div className="h-6 w-6 rounded bg-earth-100" />
            </div>
            <div className="mt-1 h-4 w-24 rounded bg-earth-100" />
          </div>
          <div className="h-6 w-16 rounded-md bg-earth-200" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <div className="h-3 w-16 rounded bg-earth-100" />
              <div className="mt-1 h-5 w-24 rounded bg-earth-200" />
            </div>
          ))}
        </div>
        <div className="mt-4 border-t pt-4">
          <div className="flex items-center gap-2">
            <div className="h-4 w-20 rounded bg-earth-100" />
            <div className="h-8 w-24 rounded bg-earth-100" />
            <div className="h-7 w-14 rounded-lg bg-earth-100" />
          </div>
        </div>
      </div>

      {/* Wallets / Plans */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="h-5 w-20 rounded bg-earth-200" />
          <div className="h-8 w-24 rounded-lg bg-earth-100" />
        </div>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="mb-3 rounded-lg border p-3">
            <div className="flex items-start justify-between">
              <div className="h-5 w-32 rounded bg-earth-200" />
              <div className="h-6 w-20 rounded bg-earth-100" />
            </div>
            <div className="mt-2 flex gap-4">
              <div className="h-3 w-24 rounded bg-earth-100" />
              <div className="h-3 w-20 rounded bg-earth-100" />
            </div>
          </div>
        ))}
      </div>

      {/* Create Booking */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 h-5 w-24 rounded bg-earth-200" />
        <div className="h-10 w-full rounded-lg bg-earth-100" />
      </div>

      {/* Booking history */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-3 h-5 w-40 rounded bg-earth-200" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-earth-100 py-2">
              <div className="h-4 w-20 rounded bg-earth-100" />
              <div className="h-4 w-12 rounded bg-earth-100" />
              <div className="h-4 w-16 rounded bg-earth-100" />
              <div className="h-5 w-14 rounded-md bg-earth-100" />
            </div>
          ))}
        </div>
      </div>

      {/* Transactions */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-3 h-5 w-40 rounded bg-earth-200" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-earth-100 py-2">
              <div className="h-4 w-20 rounded bg-earth-100" />
              <div className="h-4 w-20 rounded bg-earth-100" />
              <div className="ml-auto h-4 w-16 rounded bg-earth-100" />
              <div className="h-4 w-12 rounded bg-earth-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
