export default function MyBookingsLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-7 w-28 rounded bg-earth-200" />

      {/* Tabs skeleton */}
      <div className="flex gap-2">
        <div className="h-8 w-24 rounded-lg bg-earth-200" />
        <div className="h-8 w-24 rounded-lg bg-earth-100" />
      </div>

      {/* Booking cards skeleton */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-2xl border border-earth-200 bg-white p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="h-5 w-32 rounded bg-earth-200" />
              <div className="h-4 w-20 rounded bg-earth-100" />
            </div>
            <div className="h-6 w-16 rounded-full bg-earth-100" />
          </div>
          <div className="mt-3 h-3 w-48 rounded bg-earth-100" />
        </div>
      ))}
    </div>
  );
}
