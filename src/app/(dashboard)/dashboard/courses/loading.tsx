import { LoadingStatus } from "@/components/loading-status";

export default function Loading() {
  return (
    <div aria-busy="true" className="w-full min-w-0 space-y-3 py-2">
      <LoadingStatus>課程頁面載入中…</LoadingStatus>

      <div aria-hidden="true" className="animate-pulse space-y-3 motion-reduce:animate-none">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="h-5 w-28 rounded bg-earth-200" />
            <div className="h-3 w-44 max-w-[70vw] rounded bg-earth-100" />
          </div>
          <div className="h-9 w-28 rounded-lg bg-primary-100" />
        </div>

        <div className="flex min-w-0 flex-wrap gap-2 border-b border-earth-100 pb-2">
          <div className="h-8 w-20 rounded-full bg-primary-100" />
          <div className="h-8 w-20 rounded-full bg-earth-100" />
          <div className="h-8 w-24 rounded-full bg-earth-100" />
        </div>

        <section className="min-w-0 overflow-hidden rounded-xl border border-earth-200 bg-white">
          <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] gap-4 border-b border-earth-100 bg-earth-50 px-3 py-3 md:grid">
            <div className="h-3 w-20 rounded bg-earth-200" />
            <div className="h-3 w-16 rounded bg-earth-200" />
            <div className="h-3 w-12 rounded bg-earth-200" />
          </div>
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="grid min-w-0 grid-cols-1 gap-2 border-b border-earth-100 px-3 py-3 last:border-b-0 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] md:items-center md:gap-4"
            >
              <div className="space-y-2">
                <div className="h-4 w-36 max-w-[75vw] rounded bg-earth-200" />
                <div className="h-3 w-52 max-w-[80vw] rounded bg-earth-100" />
              </div>
              <div className="h-3 w-24 rounded bg-earth-100" />
              <div className="h-8 w-16 rounded-md bg-earth-100 md:justify-self-end" />
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
