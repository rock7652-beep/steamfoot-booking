/** 更新日誌 skeleton */
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse space-y-6">
      <div className="h-6 w-28 rounded bg-earth-200" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-earth-200 bg-white p-5 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-5 w-16 rounded bg-earth-200" />
            <div className="h-4 w-24 rounded bg-earth-100" />
          </div>
          <div className="space-y-1.5">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="h-3 w-full rounded bg-earth-100" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
