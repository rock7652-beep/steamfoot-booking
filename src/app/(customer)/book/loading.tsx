export default function BookLoading() {
  return (
    <div className="animate-pulse space-y-4">
      {/* Greeting skeleton */}
      <div className="rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="h-6 w-40 rounded bg-earth-200" />
        <div className="mt-2 h-4 w-56 rounded bg-earth-100" />
        <div className="mt-3 h-4 w-32 rounded bg-earth-100" />
        <div className="mt-4 h-12 w-full rounded-xl bg-earth-200" />
      </div>

      {/* Menu cards skeleton */}
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <div className="h-10 w-10 rounded-full bg-earth-100" />
          <div className="flex-1">
            <div className="h-4 w-24 rounded bg-earth-200" />
            <div className="mt-1 h-3 w-40 rounded bg-earth-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
