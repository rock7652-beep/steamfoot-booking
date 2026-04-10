import { KpiSkeleton, SectionSkeleton, TableSkeleton } from "@/components/ui/skeleton";

/** 對帳中心 skeleton */
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-4 w-12 rounded bg-earth-200" />
          <div className="h-6 w-24 rounded bg-earth-200" />
        </div>
        <div className="h-9 w-28 rounded-lg bg-earth-100" />
      </div>

      {/* Summary card */}
      <div className="rounded-xl border border-earth-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="h-4 w-28 rounded bg-earth-200" />
            <div className="mt-2 h-3 w-40 rounded bg-earth-100" />
          </div>
          <div className="h-6 w-14 rounded-md bg-earth-200" />
        </div>
        <div className="mt-4">
          <KpiSkeleton count={4} />
        </div>
      </div>

      {/* Check details */}
      <SectionSkeleton height="h-24" />
      <SectionSkeleton height="h-24" />

      {/* History */}
      <TableSkeleton rows={5} cols={3} />
    </div>
  );
}
