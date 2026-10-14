
export default function Loading() {
  return (
    <main className="mx-auto min-h-[60vh] w-full max-w-7xl space-y-5 p-4 sm:p-6" aria-busy="true">
      <div role="status" className="sr-only">課程管理資料載入中…</div>
      <header className="space-y-2"><div className="h-7 w-36 animate-pulse rounded bg-earth-200"/><div className="h-4 w-64 max-w-full animate-pulse rounded bg-earth-100"/></header>
      <nav aria-label="課程管理分頁" className="flex gap-2 border-b border-earth-200 pb-3 text-sm text-earth-600"><span className="rounded-lg bg-earth-100 px-4 py-2">課表</span><span className="px-4 py-2">教學項目</span><span className="px-4 py-2">空間管理</span></nav>
      <section aria-label="課表載入中" className="space-y-3"><div className="flex flex-wrap gap-2"><div className="h-11 w-40 animate-pulse rounded-xl bg-earth-100"/><div className="h-11 w-32 animate-pulse rounded-xl bg-earth-100"/><div className="h-11 w-28 animate-pulse rounded-xl bg-earth-100"/></div><div className="overflow-hidden rounded-xl border border-earth-200 bg-white"><div className="h-12 animate-pulse border-b border-earth-100 bg-earth-50"/><div className="h-20 animate-pulse border-b border-earth-100"/><div className="h-20 animate-pulse border-b border-earth-100 bg-earth-50/40"/><div className="h-20 animate-pulse"/></div></section>
    </main>
  );
}
