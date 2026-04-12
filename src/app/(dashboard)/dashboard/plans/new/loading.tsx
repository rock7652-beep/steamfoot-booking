/** 新增方案 skeleton */
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse space-y-4">
      <div className="h-6 w-24 rounded bg-earth-200" />
      <div className="rounded-xl border border-earth-200 bg-white p-5 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-20 rounded bg-earth-100" />
            <div className="h-9 w-full rounded-lg bg-earth-100" />
          </div>
        ))}
        <div className="h-10 w-full rounded-lg bg-primary-100" />
      </div>
    </div>
  );
}
