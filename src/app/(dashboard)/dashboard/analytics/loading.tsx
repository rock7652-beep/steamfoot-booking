/** 數據分析 skeleton */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-6 w-24 rounded bg-earth-200" />
      <div className="flex gap-2">
        <div className="h-8 w-28 rounded-lg bg-earth-100" />
        <div className="h-8 w-28 rounded-lg bg-earth-100" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-earth-200 bg-white" />
        ))}
      </div>
      <div className="h-64 rounded-xl border border-earth-200 bg-white" />
    </div>
  );
}
