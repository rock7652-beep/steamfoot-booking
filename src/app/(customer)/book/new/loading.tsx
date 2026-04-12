export default function NewBookingLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-7 w-28 rounded bg-earth-200" />

      {/* Quota bar */}
      <div className="rounded-lg bg-primary-50 px-4 py-3">
        <div className="h-4 w-40 rounded bg-primary-200" />
      </div>

      {/* People selector */}
      <div className="rounded-xl border border-earth-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <div className="h-4 w-20 rounded bg-earth-200" />
          <div className="h-8 w-24 rounded bg-earth-100" />
        </div>
      </div>

      {/* Calendar skeleton */}
      <div className="rounded-xl border border-earth-200 bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="h-4 w-6 rounded bg-earth-100" />
          <div className="h-5 w-32 rounded bg-earth-200" />
          <div className="h-4 w-6 rounded bg-earth-100" />
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={`h-${i}`} className="h-5 rounded bg-earth-100" />
          ))}
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="h-16 rounded bg-earth-50" />
          ))}
        </div>
      </div>
    </div>
  );
}
