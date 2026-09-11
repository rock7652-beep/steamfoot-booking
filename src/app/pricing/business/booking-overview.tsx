const steps = [
  { who: "顧客", title: "自己選時間", benefit: "少來回問時段", icon: "calendar" },
  { who: "蒸管家", title: "自動建檔", benefit: "不用重抄資料", icon: "record" },
  { who: "店長", title: "收到通知", benefit: "LINE 即時通知", icon: "bell" },
];

export function BookingOverview() {
  return (
    <section aria-labelledby="booking-overview-title" className="mx-auto max-w-6xl px-5 pb-7 sm:px-8 sm:pb-9">
      <h2 id="booking-overview-title" className="text-2xl font-semibold leading-snug">一筆預約，少三件忙事。</h2>
      <ol className="mt-5 grid grid-cols-3 gap-2 sm:gap-5">
        {steps.map((step, index) => (
          <li key={step.title} className="relative min-w-0 rounded-2xl border border-[#153B31]/15 bg-white px-2 py-5 text-center sm:p-6">
            <span className="text-sm text-[#74603C]">0{index + 1} · {step.who}</span>
            <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto my-3 h-12 w-12 text-[#153F33]">
              {step.icon === "calendar" ? <>
                <rect x="7" y="10" width="34" height="32" rx="5" /><path d="M15 6v8m18-8v8M7 20h34" />
                <path d="m16 31 5 5 11-11" stroke="#967039" strokeWidth="3" />
              </> : step.icon === "record" ? <>
                <rect x="10" y="5" width="28" height="38" rx="5" /><circle cx="24" cy="17" r="4" />
                <path d="M17 29c0-7 14-7 14 0M17 35h14" /><path d="m32 33 4 4 8-9" stroke="#967039" strokeWidth="3" />
              </> : <>
                <path d="M12 21a12 12 0 0 1 24 0v9l5 6H7l5-6ZM19 41h10M24 5v4" />
                <path d="M5 17c0-4 2-7 4-9m34 9c0-4-2-7-4-9" stroke="#967039" />
              </>}
            </svg>
            <h3 className="text-base font-semibold sm:text-xl">{step.title}</h3>
            <p className="mt-2 text-sm leading-6 text-[#4C6259] sm:text-base">{step.benefit}</p>
            {index < 2 ? <span aria-hidden="true" className="absolute -right-2 top-1/2 z-10 rounded-full bg-[#F8F5EE] px-1 text-[#967039] sm:-right-4">→</span> : null}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm leading-6 text-[#4C6259]">顧客完成資料並預約成功後，自動建檔、排入時段；LINE 通知依門市串接與設定發送。</p>
    </section>
  );
}
