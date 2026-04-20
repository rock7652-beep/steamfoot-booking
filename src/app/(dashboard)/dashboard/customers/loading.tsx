/** 顧客列表 skeleton — Phase 2 桌機版 PageShell / PageHeader / Toolbar / DataTable */
export default function Loading() {
  return (
    <div className="mx-auto flex max-w-[1440px] animate-pulse flex-col gap-4 px-6 py-6">
      {/* PageHeader */}
      <div className="flex items-center justify-between pb-1">
        <div className="space-y-1.5">
          <div className="h-5 w-28 rounded bg-earth-200" />
          <div className="h-3 w-56 rounded bg-earth-100" />
        </div>
        <div className="flex gap-1.5">
          <div className="h-7 w-14 rounded-md bg-earth-100" />
          <div className="h-7 w-20 rounded-md bg-primary-100" />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-earth-200 pb-3">
        <div className="h-8 min-w-[220px] flex-1 rounded-md bg-earth-100" />
        <div className="h-8 w-28 rounded-md bg-earth-100" />
        <div className="h-8 w-28 rounded-md bg-earth-100" />
        <div className="h-8 w-28 rounded-md bg-earth-100" />
        <div className="h-8 w-28 rounded-md bg-earth-100" />
        <div className="h-8 w-28 rounded-md bg-earth-100" />
      </div>

      {/* Result meta */}
      <div className="h-3 w-24 rounded bg-earth-100" />

      {/* DataTable */}
      <div className="overflow-hidden rounded-xl border border-earth-200 bg-white">
        <div className="flex gap-3 border-b border-earth-100 bg-earth-50 px-3 py-2">
          <div className="h-3 w-16 rounded bg-earth-200" />
          <div className="h-3 w-14 rounded bg-earth-200" />
          <div className="ml-auto h-3 w-20 rounded bg-earth-200" />
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="flex h-11 items-center gap-3 border-b border-earth-50 px-3"
          >
            <div className="h-3.5 w-28 rounded bg-earth-100" />
            <div className="h-4 w-12 rounded-md bg-earth-100" />
            <div className="ml-auto h-3 w-16 rounded bg-earth-100" />
            <div className="h-3 w-10 rounded bg-earth-100" />
            <div className="h-3 w-14 rounded bg-earth-100" />
            <div className="h-6 w-12 rounded-md border border-earth-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
