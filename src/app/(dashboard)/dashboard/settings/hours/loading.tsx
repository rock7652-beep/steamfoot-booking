/** 營業時間設定 skeleton */
export default function Loading() {
  return (
    <div className="mx-auto max-w-xl animate-pulse space-y-4">
      <div className="h-6 w-28 rounded bg-earth-200" />
      <div className="space-y-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-earth-100 bg-white px-4 py-3">
            <div className="h-4 w-8 rounded bg-earth-200" />
            <div className="h-6 w-10 rounded-full bg-earth-100" />
            <div className="h-4 w-20 rounded bg-earth-100" />
            <div className="h-4 w-4 rounded bg-earth-100" />
            <div className="h-4 w-20 rounded bg-earth-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
