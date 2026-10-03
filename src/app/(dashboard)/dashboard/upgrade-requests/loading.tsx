import { LoadingStatus } from "@/components/loading-status";

/** 升級申請 skeleton */
export default function Loading() {
  return (
    <div className="flex w-full min-w-0 animate-pulse flex-col gap-4 py-6">
      <LoadingStatus />
      <div className="flex items-center justify-between pb-1">
        <div className="space-y-1.5">
          <div className="h-5 w-24 rounded bg-earth-200" />
          <div className="h-3 w-40 rounded bg-earth-100" />
        </div>
      </div>

      <div className="rounded-xl border border-earth-200 bg-white">
        <div className="flex gap-3 border-b border-earth-100 bg-earth-50 px-3 py-2">
          <div className="h-3 w-20 rounded bg-earth-200" />
          <div className="ml-auto h-3 w-20 rounded bg-earth-200" />
        </div>
        {Array.from({ length: 5 }).map((_, j) => (
          <div
            key={j}
            className="flex h-12 items-center gap-3 border-b border-earth-50 px-3 last:border-b-0"
          >
            <div className="h-4 w-28 rounded bg-earth-200" />
            <div className="h-3 w-20 rounded bg-earth-100" />
            <div className="ml-auto h-7 w-16 rounded-md bg-earth-100" />
            <div className="h-7 w-16 rounded-md bg-earth-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
