import Link from "next/link";

export const BOOKING_TYPES = [
  { id: "slots", name: "時段預約", question: "幾點還能接幾位？", who: "蒸足、岩盤浴、桑拿、親子遊戲", detail: "固定時段、接待名額與當日名單", cta: "看時段預約" },
  { id: "services", name: "服務預約", question: "誰來服務、需要多久？", who: "SPA、美容、美體", detail: "療程時間、人員班表與服務位置", cta: "看服務預約" },
  { id: "fitness", name: "運動教室", question: "哪堂課，還有幾個名額？", who: "運動教室、瑜珈、皮拉提斯", detail: "課表、學員預約與出席紀錄", cta: "看運動教室" },
  { id: "music", name: "音樂教室", question: "誰跟哪位老師上課？", who: "音樂教室、樂器教學、才藝課程", detail: "固定課、調課補課與老師鐘點", cta: "看音樂教室" },
] as const;

export function BookingTypes({ compact = false }: { compact?: boolean }) {
  return <section id="how-it-works" aria-labelledby="booking-types-title" className={compact ? "my-8 scroll-mt-24" : "mx-auto max-w-6xl scroll-mt-24 px-5 pb-10 pt-4 sm:px-8"}>
    <p className="text-sm font-medium text-[#74603C]">從店裡的安排方式開始</p>
    <h2 id="booking-types-title" className="mt-2 text-2xl font-semibold sm:text-3xl">你的店，怎麼安排預約？</h2>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {BOOKING_TYPES.map(item => <article key={item.id} className="flex flex-col rounded-2xl border border-[#153B31]/15 bg-white/75 p-4 sm:p-5">
        <h3 className="text-xl font-semibold">{item.name}</h3>
        <p className="mt-2 text-base font-medium">{item.question}</p>
        <p className="mt-1 text-sm leading-6 text-[#4C6259]">{item.who}</p>
        <p className="mb-3 mt-2 text-sm leading-6 text-[#4C6259]">{item.detail}</p>
        <Link href={`/pricing/features/${item.id}`} className="mt-auto inline-flex min-h-11 items-center font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">{item.cta}<span aria-hidden="true" className="ml-2">→</span></Link>
      </article>)}
    </div>
    <p className="mt-3 text-sm leading-6 text-[#4C6259]">不確定適合哪一種？<a href="https://lin.ee/SGy5UBz" target="_blank" rel="noopener noreferrer" className="inline-block py-2 underline underline-offset-4">加 LINE 聊聊 ↗</a></p>
  </section>;
}
