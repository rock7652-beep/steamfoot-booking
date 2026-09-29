/** Data is unknown while loading: never display zero counts or empty slots. */
export function BookingWorkspaceLoading({ year, month }: { year?: number; month?: number }) {
  return (
    <section aria-busy="true" className="rounded-xl border border-earth-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-earth-900">
          {year && month ? `${year} 年 ${month} 月` : "預約月曆"}
        </h2>
        <p role="status" className="text-sm text-earth-600">正在讀取預約，請稍候…</p>
      </div>
      <div aria-hidden="true" className="grid grid-cols-7 gap-2">
        {Array.from({ length: 35 }, (_, index) => (
          <div key={index} className="h-20 animate-pulse rounded bg-earth-50" />
        ))}
      </div>
    </section>
  );
}
