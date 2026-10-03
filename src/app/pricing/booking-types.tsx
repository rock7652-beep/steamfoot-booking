import Link from "next/link";

export const BOOKING_TYPES = [
  { id: "slots", name: "時段預約", question: "幾點還能接幾位？", who: "蒸足、岩盤浴、桑拿、親子遊戲", detail: "固定時段、接待名額與當日名單", cta: "看時段預約" },
  { id: "services", name: "服務預約", question: "誰來服務、需要多久？", who: "SPA、美容、美體", detail: "療程時間、人員班表與服務位置", cta: "看服務預約" },
  { id: "fitness", name: "運動課程", question: "哪堂課，還有幾個名額？", who: "運動教室、瑜珈、皮拉提斯", detail: "課表、學員預約與出席紀錄", cta: "看運動教室" },
  { id: "music", name: "音樂課程", question: "誰跟哪位老師上課？", who: "音樂教室、樂器教學、才藝課程", detail: "固定課、調課補課與老師鐘點", cta: "看音樂教室" },
] as const;

function BookingTypeIcon({ type }: { type: typeof BOOKING_TYPES[number]["id"] }) {
  return <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#EEF2EC]">
    <svg aria-hidden="true" focusable="false" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-9 w-9 text-[#153F33]">
      {type === "slots" ? <>
        <path d="M25 40H10a4 4 0 0 1-4-4V13a4 4 0 0 1 4-4h25a4 4 0 0 1 4 4v10M6 19h33M14 5v8m17-8v8" />
        <circle cx="33" cy="33" r="10" /><path d="M33 27v6l4 3" stroke="#967039" strokeWidth="2.5" />
      </> : type === "services" ? <>
        <path d="M24 33C13 26 13 15 24 6c11 9 11 20 0 27Z" />
        <path d="M24 36C11 36 5 28 5 18c10 0 17 5 19 15m0 3c13 0 19-8 19-18-10 0-17 5-19 15" />
        <path d="M13 41h22M7 8v6M4 11h6m28-6v6m-3-3h6" stroke="#967039" />
      </> : type === "fitness" ? <>
        <rect x="7" y="12" width="7" height="24" rx="2" /><rect x="34" y="12" width="7" height="24" rx="2" />
        <path d="M4 19v10m40-10v10M14 20h20m-20 8h20" />
        <path d="m19 11 3-4m4 4 3-4m-10 34 3-4m4 4 3-4" stroke="#967039" />
      </> : <>
        <path d="M18 34V13l22-5v22M18 20l22-5" />
        <ellipse cx="12" cy="35" rx="6" ry="5" /><ellipse cx="34" cy="31" rx="6" ry="5" />
        <path d="M7 8v8M3 12h8m15 28h5" stroke="#967039" />
      </>}
    </svg>
  </span>;
}

export function BookingTypes({ compact = false }: { compact?: boolean }) {
  return <section id="how-it-works" aria-labelledby="booking-types-title" className={compact ? "my-8 scroll-mt-24" : "mx-auto max-w-6xl scroll-mt-24 px-5 pb-10 pt-4 sm:px-8"}>
    <p className="text-sm font-medium text-[#74603C]">從店裡的安排方式開始</p>
    <h2 id="booking-types-title" className="mt-2 text-2xl font-semibold sm:text-3xl">你的店，怎麼安排預約？</h2>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {BOOKING_TYPES.map(item => <article key={item.id} className="flex flex-col rounded-2xl border border-[#153B31]/15 bg-white/75 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <BookingTypeIcon type={item.id} />
          <h3 className="text-xl font-semibold">{item.name}</h3>
        </div>
        <p className="mt-4 text-base font-medium">{item.question}</p>
        <p className="mb-3 mt-1 text-sm leading-6 text-[#4C6259]">{item.who}</p>
        <Link href={`/pricing/features/${item.id}`} className="mt-auto inline-flex min-h-11 items-center font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"><span aria-hidden="true">了解更多</span><span className="sr-only">了解{item.name}</span><span aria-hidden="true" className="ml-2">→</span></Link>
      </article>)}
    </div>
    <p className="mt-3 text-sm leading-6 text-[#4C6259]">不確定適合哪一種？<a href="https://lin.ee/SGy5UBz" target="_blank" rel="noopener noreferrer" className="inline-block py-2 underline underline-offset-4">加 LINE 聊聊 ↗</a></p>
  </section>;
}
