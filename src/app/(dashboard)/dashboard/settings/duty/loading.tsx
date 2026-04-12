/** 值班設定 skeleton */
export default function Loading() {
  return (
    <div className="mx-auto max-w-xl animate-pulse space-y-4">
      <div className="h-6 w-28 rounded bg-earth-200" />
      <div className="rounded-xl border border-earth-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-4 w-32 rounded bg-earth-100" />
          <div className="h-6 w-12 rounded-full bg-earth-200" />
        </div>
        <div className="h-3 w-full rounded bg-earth-100" />
      </div>
    </div>
  );
}
