/** 教育訓練 skeleton */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-6 w-24 rounded bg-earth-200" />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 rounded-xl border border-earth-200 bg-white" />
        ))}
      </div>
    </div>
  );
}
