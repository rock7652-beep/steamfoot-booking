import Link from "next/link";

export function BookingTypes({ compact = false }: { compact?: boolean }) {
  return <section id="how-it-works" aria-labelledby="booking-types-title" className={compact ? "my-8 scroll-mt-24" : "mx-auto max-w-6xl scroll-mt-24 px-5 pb-10 pt-4 sm:px-8"}>
    <p className="text-sm font-medium text-[#74603C]">從店裡的安排方式開始</p>
    <h2 id="booking-types-title" className="mt-2 text-2xl font-semibold sm:text-3xl">你的店，怎麼安排預約？</h2>
    <div className="mt-5 grid gap-3 md:grid-cols-3">
      {[
        { name: "時段預約", question: "幾點還能接幾位？", who: "蒸足、固定場次體驗", href: "/pricing/features/slots", cta: "看時段預約", status: "按時段接待顧客" },
        { name: "服務預約", question: "誰來服務、需要多久？", who: "SPA、美容、美體", href: "/pricing/features/services", cta: "看服務預約", status: "按服務安排人員" },
        { name: "課程預約", question: "哪堂課、還有幾個名額？", who: "運動教室、瑜珈、皮拉提斯", href: "/pricing/fitness.html", cta: "登記體驗意願", status: "籌備中・招募體驗店家" },
      ].map((item, i) => <article key={item.name} className="flex flex-col rounded-2xl border border-[#153B31]/15 bg-white/75 p-5 sm:p-6">
        <p className={i === 2 ? "text-sm font-medium text-[#80602E]" : "text-sm text-[#4C6259]"}>{item.status}</p>
        <h3 className="mt-2 text-xl font-semibold">{item.name}</h3>
        <p className="mt-3 text-base font-medium">{item.question}</p>
        <p className="mt-2 text-sm leading-6 text-[#4C6259]">{item.who}</p>
        <Link href={item.href} className="mt-4 inline-flex min-h-11 items-center font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">{item.cta}<span aria-hidden="true" className="ml-2">→</span></Link>
      </article>)}
    </div>
    <p className="mt-3 text-sm leading-6 text-[#4C6259]">不確定適合哪一種？<a href="https://lin.ee/SGy5UBz" target="_blank" rel="noopener noreferrer" className="inline-block py-2 underline underline-offset-4">加 LINE 聊聊 ↗</a></p>
  </section>;
}
