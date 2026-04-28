/** 獎勵項目管理 skeleton */
export default function Loading() {
  return (
    <div className="mx-auto flex max-w-[1440px] animate-pulse flex-col gap-4 px-6 py-6">
      <div className="flex items-center justify-between pb-1">
        <div className="space-y-1.5">
          <div className="h-5 w-32 rounded bg-earth-200" />
          <div className="h-3 w-48 rounded bg-earth-100" />
        </div>
        <div className="h-7 w-24 rounded-md bg-earth-100" />
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
        <div className="h-3 w-3/4 rounded bg-amber-200/60" />
        <div className="mt-2 h-3 w-1/2 rounded bg-amber-100" />
      </div>

      <div className="rounded-xl border border-earth-200 bg-white">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-earth-50 px-4 py-3 last:border-b-0"
          >
            <div className="h-4 w-32 rounded bg-earth-200" />
            <div className="h-3 w-16 rounded bg-earth-100" />
            <div className="ml-auto h-7 w-16 rounded-md bg-earth-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
