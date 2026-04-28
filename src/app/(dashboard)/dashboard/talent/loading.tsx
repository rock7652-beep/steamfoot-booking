/** 人才管道 skeleton — pipeline columns */
export default function Loading() {
  return (
    <div className="mx-auto flex max-w-[1440px] animate-pulse flex-col gap-4 px-6 py-6">
      <div className="flex items-center justify-between pb-1">
        <div className="space-y-1.5">
          <div className="h-5 w-24 rounded bg-earth-200" />
          <div className="h-3 w-40 rounded bg-earth-100" />
        </div>
        <div className="h-7 w-20 rounded-md bg-earth-100" />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-earth-200 bg-white p-3"
          >
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-16 rounded bg-earth-200" />
              <div className="h-3 w-8 rounded bg-earth-100" />
            </div>
            <div className="mt-3 space-y-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <div
                  key={j}
                  className="rounded-md border border-earth-100 p-2"
                >
                  <div className="h-3.5 w-20 rounded bg-earth-200" />
                  <div className="mt-1.5 h-3 w-28 rounded bg-earth-100" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
