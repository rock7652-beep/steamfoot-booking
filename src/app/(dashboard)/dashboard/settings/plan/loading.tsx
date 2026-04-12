/** 方案設定 skeleton */
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse space-y-4">
      <div className="h-6 w-24 rounded bg-earth-200" />
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-48 rounded-xl border-2 border-earth-200 bg-white p-4 space-y-3">
            <div className="h-5 w-20 rounded bg-earth-200" />
            <div className="h-7 w-24 rounded bg-earth-100" />
            <div className="space-y-1.5">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-3 w-full rounded bg-earth-100" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
