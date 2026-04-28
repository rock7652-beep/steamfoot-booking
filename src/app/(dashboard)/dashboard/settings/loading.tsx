/** 設定首頁 skeleton — 三欄控制台 */
export default function Loading() {
  return (
    <div className="mx-auto flex max-w-[1440px] animate-pulse flex-col gap-4 px-6 py-6">
      <div className="flex items-center justify-between pb-1">
        <div className="space-y-1.5">
          <div className="h-5 w-16 rounded bg-earth-200" />
          <div className="h-3 w-56 rounded bg-earth-100" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[200px_1fr_240px]">
        {/* 左欄 nav */}
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-20 rounded bg-earth-200" />
              <div className="h-4 w-32 rounded bg-earth-100" />
              <div className="h-4 w-28 rounded bg-earth-100" />
            </div>
          ))}
        </div>

        {/* 中欄 cards */}
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-earth-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-earth-100" />
                <div className="space-y-1">
                  <div className="h-4 w-32 rounded bg-earth-200" />
                  <div className="h-3 w-48 rounded bg-earth-100" />
                </div>
                <div className="ml-auto h-7 w-20 rounded-md bg-earth-100" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="h-3 rounded bg-earth-100" />
                <div className="h-3 rounded bg-earth-100" />
              </div>
            </div>
          ))}
        </div>

        {/* 右欄 side */}
        <div className="space-y-3">
          <div className="rounded-xl border border-earth-200 bg-white p-3">
            <div className="h-3 w-16 rounded bg-earth-200" />
            <div className="mt-2 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-7 rounded-md bg-earth-100" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
