export default function ProfileLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-7 w-28 rounded bg-earth-200" />

      {/* Profile form skeleton */}
      <div className="rounded-2xl border border-earth-200 bg-white p-6 space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-16 rounded bg-earth-100" />
            <div className="h-10 w-full rounded-lg bg-earth-100" />
          </div>
        ))}
        <div className="h-10 w-28 rounded-lg bg-earth-200" />
      </div>
    </div>
  );
}
