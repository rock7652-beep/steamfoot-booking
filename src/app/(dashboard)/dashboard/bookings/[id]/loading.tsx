/** 預約詳情 skeleton */
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse space-y-4">
      <div className="h-4 w-16 rounded bg-earth-100" />
      <div className="rounded-xl border border-earth-200 bg-white p-5 space-y-4">
        <div className="h-6 w-32 rounded bg-earth-200" />
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 w-16 rounded bg-earth-100" />
              <div className="h-5 w-full rounded bg-earth-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
