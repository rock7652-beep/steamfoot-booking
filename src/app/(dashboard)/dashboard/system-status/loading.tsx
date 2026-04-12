/** 系統狀態 skeleton */
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-earth-200" />
        <div className="space-y-1">
          <div className="h-5 w-24 rounded bg-earth-200" />
          <div className="h-3 w-48 rounded bg-earth-100" />
        </div>
      </div>
      {Array.from({ length: 3 }).map((_, s) => (
        <div key={s} className="space-y-2">
          <div className="h-4 w-20 rounded bg-earth-200" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg border border-earth-100 bg-white" />
          ))}
        </div>
      ))}
    </div>
  );
}
