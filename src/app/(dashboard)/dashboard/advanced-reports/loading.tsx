export default function Loading() {
  return (
    <div className="mx-auto flex max-w-[1440px] animate-pulse flex-col gap-4 px-6 py-6">
      <div className="flex items-center justify-between pb-1">
        <div className="space-y-1.5">
          <div className="h-5 w-24 rounded bg-earth-200" />
          <div className="h-3 w-56 rounded bg-earth-100" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-36 rounded-md bg-earth-100" />
          <div className="h-8 w-14 rounded-md bg-earth-100" />
        </div>
      </div>

      <div className="flex h-10 items-center gap-6 border-b border-earth-100">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-3 w-16 rounded bg-earth-100" />
            <div className="h-4 w-14 rounded bg-earth-200" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-earth-200 bg-white px-3 py-3">
            <div className="h-3 w-20 rounded bg-earth-100" />
            <div className="mt-3 h-7 w-24 rounded bg-earth-200" />
            <div className="mt-3 h-3 w-full rounded bg-earth-100" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-earth-200 bg-white">
            <div className="space-y-1 border-b border-earth-100 px-3 py-2">
              <div className="h-3.5 w-20 rounded bg-earth-200" />
              <div className="h-3 w-48 rounded bg-earth-100" />
            </div>
            <div className="grid grid-cols-3 gap-2 px-3 py-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j}>
                  <div className="h-3 w-12 rounded bg-earth-100" />
                  <div className="mt-2 h-4 w-20 rounded bg-earth-200" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-earth-200 bg-white">
        <div className="space-y-1 border-b border-earth-100 px-3 py-2">
          <div className="h-3.5 w-24 rounded bg-earth-200" />
          <div className="h-3 w-56 rounded bg-earth-100" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex h-11 items-center gap-3 border-b border-earth-50 px-3">
            <div className="h-3 w-24 rounded bg-earth-100" />
            <div className="h-3 w-28 rounded bg-earth-100" />
            <div className="ml-auto h-3 w-16 rounded bg-earth-100" />
            <div className="h-3 w-24 rounded bg-earth-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
