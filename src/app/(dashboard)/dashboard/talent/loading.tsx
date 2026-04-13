export default function TalentLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-4 animate-pulse">
      {/* Title */}
      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="h-5 w-24 rounded bg-earth-200" />
        <div className="mt-2 h-3 w-48 rounded bg-earth-100" />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl bg-earth-50 px-3 py-2.5">
            <div className="h-3 w-12 rounded bg-earth-200" />
            <div className="mt-2 h-6 w-8 rounded bg-earth-200" />
          </div>
        ))}
      </div>

      {/* Funnel */}
      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="h-4 w-20 rounded bg-earth-200" />
        <div className="mt-4 space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-3 w-20 rounded bg-earth-100" />
              <div
                className="h-7 rounded bg-earth-200"
                style={{ width: `${70 - i * 10}%` }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="h-4 w-24 rounded bg-earth-200" />
        <div className="mt-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-4 w-20 rounded bg-earth-100" />
              <div className="h-4 flex-1 rounded bg-earth-100" />
              <div className="h-5 w-14 rounded bg-earth-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
