import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "蒸管家｜店務少一點忙，顧客多一點照顧",
  description: "預約、堂數、收款與顧客追蹤，集中管理。了解蒸管家如何協助預約制門市與工作室的日常營運。",
  robots: { index: false, follow: false },
};

const LINE_URL = "https://lin.ee/SGy5UBz";
const benefits = [
  { number: "01", title: "少回覆", question: "預約時間，還在來回確認？", description: "顧客從 LINE 入口自行預約，把可預約時間看清楚，減少來回詢問。" },
  { number: "02", title: "少漏事", question: "忙起來，就忘了提醒顧客？", description: "設定自動提醒，讓顧客確認會到、調整或取消預約；店長也能看到回覆。" },
  { number: "03", title: "少翻找", question: "剩幾堂、付了沒，要到處找？", description: "預約、顧客、方案堂數與收款紀錄集中查看，接待時不用反覆翻對話。" },
];
const steps = [
  { role: "顧客", title: "在 LINE 裡安排預約", description: "選擇日期與可預約時段，也能查詢自己的方案堂數。" },
  { role: "系統", title: "依設定送出提醒", description: "顧客可確認會到、調整時間或取消，減少店長逐一聯繫。" },
  { role: "店長", title: "集中掌握當日店務", description: "查看預約與顧客資訊，服務完成後處理堂數與收款紀錄。" },
];

function ConsultLink({ light = false }: { light?: boolean }) {
  return <a href={LINE_URL} target="_blank" rel="noopener noreferrer"
    className={`inline-flex min-h-12 items-center justify-center rounded-full px-6 py-3 text-center text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#B58C43] ${light ? "bg-[#F5EFE3] text-[#123E32] hover:bg-white" : "bg-[#123E32] text-white hover:bg-[#245A49]"}`}>
    加 LINE，預約免費介紹<span aria-hidden="true" className="ml-3">↗</span>
  </a>;
}

export default function BusinessPage() {
  return (
    <div className="bg-[#F8F5EE] text-[#153B31] selection:bg-[#DFC99D]">
      <a href="#main" className="sr-only focus:not-sr-only focus:block focus:p-4">跳至主要內容</a>
      <header className="border-b border-[#153B31]/15">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <a href="#main" className="text-xl font-bold tracking-widest">蒸管家<span className="ml-2 text-[#967039]" aria-hidden="true">·</span></a>
          <nav aria-label="主要導覽" className="flex gap-5 text-sm sm:gap-8">
            <a href="#how-it-works" className="hover:underline">怎麼運作</a>
            <Link href="/pricing" className="hover:underline">方案價格</Link>
          </nav>
        </div>
      </header>
      <main id="main">
        <section aria-labelledby="hero-title" className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-14 sm:px-8 sm:py-24 lg:grid-cols-[1.5fr_1fr] lg:items-end lg:gap-16">
          <div>
            <p className="mb-6 text-sm font-medium tracking-[0.16em] text-[#74603C]">給每天用心經營的店長</p>
            <h1 id="hero-title" className="text-[clamp(2.3rem,5.5vw,4.5rem)] font-semibold leading-[1.3] tracking-tight">
              店務少一點忙，<br /><span className="text-[#967039]">顧客多一點照顧。</span>
            </h1>
            <p className="mt-7 max-w-lg text-lg leading-relaxed text-[#4C6259]">預約、堂數、收款與顧客追蹤，<br className="hidden sm:block" />蒸管家幫你集中管理。</p>
            <div className="mt-9 flex flex-wrap items-center gap-5">
              <ConsultLink />
              <a href="#how-it-works" className="py-3 text-base underline underline-offset-8">看看怎麼運作</a>
            </div>
          </div>
          <aside aria-label="服務理念" className="border-l-2 border-[#B58C43] py-2 pl-6 lg:mb-3">
            <p className="text-sm text-[#74603C]">每一家店，都值得擁有一位數位管家。</p>
            <p className="mt-5 text-2xl font-medium leading-relaxed">把時間留給眼前的顧客，<br />也留一點給自己。</p>
            <p className="mt-5 text-base leading-relaxed text-[#4C6259]">從單店的日常開始。<br />適合預約制門市、工作室與服務品牌。</p>
          </aside>
        </section>

        <section aria-labelledby="benefits-title" className="bg-[#123E32] px-5 py-16 text-[#F8F5EE] sm:px-8 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <h2 id="benefits-title" className="text-3xl font-semibold leading-snug">一天的忙，<br className="sm:hidden" />不必都靠你記住。</h2>
            <div className="mt-10 grid gap-9 md:grid-cols-3 md:gap-10">
              {benefits.map((item) => <article key={item.number} className="border-t border-white/25 pt-6">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-3xl font-medium">{item.title}</h3>
                  <span className="text-sm text-[#DFC99D]">{item.number}</span>
                </div>
                <p className="mt-6 text-lg font-medium">{item.question}</p>
                <p className="mt-3 text-base leading-8 text-[#D4E0D8]">{item.description}</p>
              </article>)}
            </div>
          </div>
        </section>

        <section id="how-it-works" aria-labelledby="workflow-title" className="mx-auto max-w-6xl scroll-mt-6 px-5 py-16 sm:px-8 sm:py-24">
          <p className="text-sm font-medium tracking-widest text-[#74603C]">從預約到店務</p>
          <h2 id="workflow-title" className="mt-4 text-3xl font-semibold leading-snug sm:text-4xl">顧客方便，店長也輕鬆。</h2>
          <p className="mt-5 max-w-xl text-base leading-8 text-[#4C6259]">一筆預約，從顧客的 LINE 入口，到店長的日常管理。先看這三個環節。</p>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {steps.map((step, index) => <li key={step.role} className="rounded-2xl border border-[#153B31]/15 bg-white p-6 sm:p-8">
              <div className="flex items-center justify-between text-sm text-[#74603C]"><span>{step.role}</span><span>0{index + 1}</span></div>
              <h3 className="mt-7 text-xl font-semibold">{step.title}</h3>
              <p className="mt-4 text-base leading-8 text-[#4C6259]">{step.description}</p>
            </li>)}
          </ol>
          <div className="mt-8 border-l-2 border-[#B58C43] pl-5">
            <h3 className="text-lg font-semibold">也照顧有體態管理需求的門市</h3>
            <p className="mt-2 text-base leading-8 text-[#4C6259]">健康評估與體態追蹤模組，可記錄量測、查看歷史數據與變化趨勢。依方案選配或加購，不作醫療診斷或效果保證。</p>
          </div>
        </section>

        <section aria-labelledby="cases-title" className="border-y border-[#153B31]/15 bg-[#EEE9DD] px-5 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <p className="text-sm font-medium tracking-widest text-[#74603C]">店家案例</p>
            <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
              <div><h2 id="cases-title" className="text-3xl font-semibold leading-snug">從真實店務，<br />認識蒸管家。</h2>
                <p className="mt-5 text-base leading-8 text-[#4C6259]">想了解與自己門市相近的使用情境？免費介紹時，可以從店家案例開始聊。</p>
              </div>
              <div className="divide-y divide-[#153B31]/20 border-y border-[#153B31]/20">
                {[["A", "暖沐蒸足"], ["B", "暖暖蒸足"]].map(([letter, name]) => <article key={letter} className="flex items-center gap-6 py-7">
                  <span className="text-sm text-[#74603C]">案例 {letter}</span><h3 className="text-2xl font-medium">{name}</h3>
                </article>)}
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="contact-title" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
          <div className="grid gap-10 lg:grid-cols-[1.25fr_1fr] lg:items-center">
            <div><p className="text-sm font-medium tracking-widest text-[#74603C]">從你的門市需要開始</p>
              <h2 id="contact-title" className="mt-4 text-3xl font-semibold leading-snug sm:text-4xl">先聊聊，<br />你最想少忙哪件事？</h2>
              <p className="mt-5 max-w-lg text-base leading-8 text-[#4C6259]">不用先研究完整功能表。告訴我們你的店怎麼運作，一起看看哪些功能用得上。</p>
            </div>
            <div className="rounded-2xl bg-[#123E32] p-7 text-[#F8F5EE] sm:p-9">
              <p className="text-base">基本版・限時優惠</p>
              <p className="mt-3 text-base">每月 <span className="text-4xl font-semibold tracking-tight">NT$1,490</span> 起</p>
              <p className="mt-5 text-base leading-7 text-[#D4E0D8]">三個付費方案皆內含 LINE 顧客入口（LIFF）；自動提醒等模組依方案選配。</p>
              <div className="mt-7"><ConsultLink light /></div>
              <Link href="/pricing" className="mt-5 inline-block py-2 text-base underline underline-offset-8">查看完整方案與加購說明</Link>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-[#153B31]/15 px-5 py-7 text-sm text-[#4C6259] sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4">
          <p>蒸管家｜每一家店都值得擁有一位數位管家。</p>
          <Link href="/" className="underline underline-offset-4">既有使用者登入</Link>
        </div>
      </footer>
    </div>
  );
}
