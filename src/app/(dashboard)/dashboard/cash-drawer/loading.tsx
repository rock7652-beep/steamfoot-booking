/** Cash Drawer 頁 skeleton */
export default function Loading() {
  return (
    <div className="max-w-3xl animate-pulse space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-24 rounded bg-earth-200" />
          <div className="h-3 w-48 rounded bg-earth-100" />
        </div>
        <div className="h-4 w-16 rounded bg-earth-100" />
      </div>
      <div className="rounded-xl border border-earth-200 bg-white p-6">
        <div className="h-5 w-32 rounded bg-earth-200" />
        <div className="mt-3 h-3 w-3/4 rounded bg-earth-100" />
        <div className="mt-6 space-y-3">
          <div className="h-9 w-full rounded-lg bg-earth-100" />
          <div className="h-9 w-full rounded-lg bg-earth-100" />
          <div className="h-16 w-full rounded-lg bg-earth-100" />
          <div className="h-9 w-full rounded-lg bg-primary-100" />
        </div>
      </div>
    </div>
  );
}
