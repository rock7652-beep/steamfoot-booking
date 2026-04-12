/** 單日值班詳情 skeleton */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="flex items-center gap-2">
        <div className="h-4 w-12 rounded bg-earth-100" />
        <div className="h-6 w-32 rounded bg-earth-200" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-earth-100 bg-white px-4 py-3">
            <div className="h-4 w-16 rounded bg-earth-200" />
            <div className="flex gap-1">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="h-6 w-14 rounded-md bg-earth-100" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
