export default function MyPlansLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-7 w-28 rounded bg-earth-200" />

      {/* Plan cards skeleton */}
      {[1, 2].map((i) => (
        <div key={i} className="rounded-2xl border border-earth-200 bg-white p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-5 w-28 rounded bg-earth-200" />
            <div className="h-5 w-16 rounded-full bg-earth-100" />
          </div>
          <div className="flex gap-4">
            <div className="h-10 w-20 rounded bg-earth-100" />
            <div className="h-10 w-20 rounded bg-earth-100" />
          </div>
          <div className="h-2 w-full rounded-full bg-earth-100" />
        </div>
      ))}
    </div>
  );
}
