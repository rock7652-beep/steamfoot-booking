import { LoadingStatus } from "@/components/loading-status";

/** Content-sized route fallback. Existing dashboard navigation stays mounted. */
export function WorkspaceLoading({ settings = false, label = "正在載入內容…" }: { settings?: boolean; label?: string }) {
  return <div className="w-full min-w-0 space-y-4 py-4" aria-busy="true">
    <LoadingStatus>{label}</LoadingStatus>
    <div aria-hidden="true" className="space-y-4 motion-safe:animate-pulse">
      <div className="h-6 w-28 max-w-full rounded bg-earth-200" />
      <div className={settings ? "grid min-w-0 gap-3 md:grid-cols-[170px_minmax(0,1fr)]" : "min-w-0"}>
        {settings && <div className="hidden space-y-3 rounded-xl border border-earth-200 bg-white p-3 md:block">
          {Array.from({ length: 5 }, (_, index) => <div key={index} className="h-10 rounded bg-earth-100" />)}
        </div>}
        <div className="min-w-0 rounded-xl border border-earth-200 bg-white px-4 sm:px-5">
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="flex min-h-16 min-w-0 flex-wrap items-center gap-4 border-b border-earth-100 py-3 last:border-0">
            <div className="h-4 w-32 max-w-full rounded bg-earth-200" />
            <div className="h-4 min-w-0 flex-1 rounded bg-earth-100" />
            <div className="h-10 w-20 max-w-full rounded-lg bg-earth-100" />
          </div>)}
        </div>
      </div>
    </div>
  </div>;
}
