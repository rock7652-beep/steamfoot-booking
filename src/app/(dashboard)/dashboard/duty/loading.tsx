/** 值班排班 skeleton — 週檢視 */
export default function Loading() {
  return (
    <div className="animate-pulse">
      {/* Header + week nav */}
      <div className="mb-4 flex items-center justify-between">
        <div className="h-6 w-28 rounded bg-earth-200" />
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-earth-100" />
          <div className="h-5 w-32 rounded bg-earth-200" />
          <div className="h-8 w-8 rounded-lg bg-earth-100" />
        </div>
      </div>

      {/* Week grid header */}
      <div className="mb-2 grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-8 rounded bg-earth-100 text-center" />
        ))}
      </div>

      {/* Duty rows */}
      {Array.from({ length: 3 }).map((_, row) => (
        <div key={row} className="mb-1 grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }).map((_, col) => (
            <div
              key={col}
              className="h-16 rounded-lg bg-earth-50 border border-earth-100"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
