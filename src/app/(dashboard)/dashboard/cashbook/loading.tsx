/** 現金簿列表 skeleton */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-6 w-20 rounded bg-earth-200" />
        <div className="h-8 w-24 rounded-lg bg-primary-100" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl border border-earth-200 bg-white" />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-earth-200 bg-white">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-4 border-b border-earth-100 px-4 py-3">
            <div className="h-4 w-20 rounded bg-earth-100" />
            <div className="h-4 w-16 rounded bg-earth-100" />
            <div className="h-4 w-24 rounded bg-earth-100" />
            <div className="ml-auto h-4 w-16 rounded bg-earth-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
