/** 排行榜 skeleton */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-6 w-20 rounded bg-earth-200" />
      <div className="flex gap-2">
        <div className="h-8 w-20 rounded-lg bg-earth-100" />
        <div className="h-8 w-20 rounded-lg bg-earth-100" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-earth-200 bg-white px-4 py-3">
            <div className="h-8 w-8 rounded-full bg-earth-200" />
            <div className="h-4 w-24 rounded bg-earth-100" />
            <div className="ml-auto h-4 w-16 rounded bg-earth-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
