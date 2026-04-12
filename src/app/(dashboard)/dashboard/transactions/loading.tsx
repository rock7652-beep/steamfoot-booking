/** 交易紀錄 skeleton */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-6 w-24 rounded bg-earth-200" />
        <div className="flex gap-2">
          <div className="h-8 w-24 rounded-lg bg-earth-100" />
          <div className="h-8 w-20 rounded-lg bg-earth-100" />
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-earth-200 bg-white">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-earth-100 px-4 py-3">
            <div className="h-4 w-20 rounded bg-earth-100" />
            <div className="h-4 w-24 rounded bg-earth-100" />
            <div className="h-4 w-16 rounded bg-earth-100" />
            <div className="ml-auto h-4 w-20 rounded bg-earth-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
