/** 提醒管理 skeleton */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-6 w-24 rounded bg-earth-200" />
        <div className="h-8 w-24 rounded-lg bg-primary-100" />
      </div>
      <div className="overflow-hidden rounded-xl border border-earth-200 bg-white">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-earth-100 px-4 py-3">
            <div className="h-4 w-20 rounded bg-earth-100" />
            <div className="h-4 w-32 rounded bg-earth-100" />
            <div className="h-5 w-14 rounded-md bg-earth-100" />
            <div className="ml-auto h-4 w-12 rounded bg-earth-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
