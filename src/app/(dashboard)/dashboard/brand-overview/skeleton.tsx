export function BrandOverviewSkeleton() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="h-4 w-24 rounded bg-earth-200" />
          <div className="h-8 w-48 rounded bg-earth-200" />
          <div className="h-4 w-80 max-w-full rounded bg-earth-100" />
        </div>
        <div className="h-8 w-44 rounded-lg bg-earth-100" />
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-9 w-24 rounded-lg bg-earth-100" />
        ))}
      </div>

      <div className="rounded-2xl border border-earth-200 bg-white p-5">
        <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="h-72 rounded-2xl bg-earth-100" />
          <div className="space-y-3">
            <div className="h-5 w-28 rounded bg-earth-200" />
            <div className="h-4 w-full rounded bg-earth-100" />
            <div className="h-4 w-4/5 rounded bg-earth-100" />
            <div className="grid grid-cols-2 gap-3 pt-4">
              <div className="h-20 rounded-xl bg-earth-50" />
              <div className="h-20 rounded-xl bg-earth-50" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-28 rounded-xl border border-earth-200 bg-white" />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="h-64 rounded-xl border border-earth-200 bg-white" />
        <div className="h-64 rounded-xl border border-earth-200 bg-white" />
      </div>
    </div>
  );
}
