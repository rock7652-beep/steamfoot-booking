import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { DayStory } from "./day-story";

export const metadata: Metadata = {
  title: "蒸管家｜每一家店，都值得擁有一位數位管家",
  description: "預約、堂數、收款與顧客追蹤，集中管理。了解蒸管家如何協助預約制門市與工作室的日常營運。",
  robots: { index: false, follow: false },
};

const LINE_URL = "https://lin.ee/SGy5UBz";
const TRIAL_URL = "/pricing/apply.html?intent=trial&utm_source=website&utm_medium=organic&utm_campaign=trial-interest&utm_content=business";
function ConsultLink({ light = false }: { light?: boolean }) {
  return <a href={TRIAL_URL}
    className={`inline-flex min-h-12 items-center justify-center rounded-full px-6 py-3 text-center text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#B58C43] ${light ? "bg-[#F5EFE3] text-[#123E32] hover:bg-white" : "bg-[#123E32] text-white hover:bg-[#245A49]"}`}>
    申請體驗帳號<span aria-hidden="true" className="ml-3">→</span>
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
        <section aria-labelledby="hero-title" className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
          <div>
            <p className="mb-3 text-sm font-medium tracking-[0.16em] text-[#74603C]">簡單學・一眼懂・輕鬆做</p>
            <h1 id="hero-title" className="text-[clamp(1.8rem,3.5vw,3rem)] font-semibold leading-[1.3] tracking-tight">
              <span className="block sm:inline">每一家店，</span><span className="text-[#967039]">都值得擁有<span className="whitespace-nowrap">一位數位管家。</span></span>
            </h1>
            <p className="mt-3 text-lg leading-relaxed text-[#4C6259]">店務少一點忙，顧客多一點照顧。</p>
            <p className="mt-2 max-w-2xl text-base leading-relaxed text-[#4C6259]">預約、堂數、收款與顧客追蹤，蒸管家幫你集中管理。</p>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
              <ConsultLink />
              <a href="#how-it-works" className="py-3 text-base underline underline-offset-8">看看怎麼運作</a>
            </div>
            <p className="mt-2 text-sm leading-6 text-[#4C6259]">填寫門市需求後，由專人聯繫安排體驗。</p>
          </div>
        </section>

        <DayStory />

        <section aria-labelledby="cases-title" className="border-y border-[#153B31]/15 bg-[#EEE9DD] px-5 py-7 sm:px-8 sm:py-8">
          <div className="mx-auto max-w-6xl">
            <p className="text-sm font-medium tracking-widest text-[#74603C]">店家案例</p>
            <div className="mt-3 grid gap-4">
              <div><h2 id="cases-title" className="text-2xl font-semibold leading-snug">真實店家，實際使用。</h2>
                
              </div>
              <div className="grid items-start gap-4 md:grid-cols-2">
                <article className="flex flex-col rounded-xl border border-[#153B31]/15 bg-white/60 p-5">
                  <p className="text-sm text-[#74603C]">預約提醒</p>
                  <h3 className="mt-2 text-2xl font-medium">暖沐蒸足</h3>
                  <p className="mt-3 text-base leading-7 text-[#4C6259]">自動提醒顧客，店長集中查看通知設定與發送紀錄。</p>
                  <a href="#how-it-works" className="mt-4 inline-flex min-h-12 items-center text-sm font-medium underline underline-offset-4">查看功能示意 ↑</a>
                </article>
                <article className="flex flex-col rounded-xl border border-[#153B31]/15 bg-white/60 p-5">
                  <p className="text-sm text-[#74603C]">顧客體驗預約與日常管理</p>
                  <h3 className="mt-2 text-2xl font-medium">暖暖蒸足</h3>

                  <p className="mt-3 text-base leading-7 text-[#4C6259]">顧客自行選日期與時段，店長在後台查看每日預約。</p>
                  <a href="/pricing/business-assets/booking-time-original.png" target="_blank" rel="noopener noreferrer" className="mt-4 flex items-center gap-3 rounded-lg border border-[#153B31]/15 bg-white p-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2" aria-label="另開真實預約畫面">
                    <Image src="/pricing/business-assets/booking-time-original.png" width={1532} height={1364} sizes="(max-width: 640px) 128px, 160px" unoptimized alt="" className="h-auto w-32 shrink-0 rounded object-contain sm:w-40" />
                    <span>查看真實預約畫面 <span aria-hidden="true">↗</span><span className="mt-1 block font-normal text-[#64756D]">點擊查看高清原圖</span></span>
                  </a>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="contact-title" className="mx-auto max-w-6xl px-5 py-7 sm:px-8 sm:py-8">
          <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr] lg:items-center">
            <div><p className="text-sm font-medium tracking-widest text-[#74603C]">從你的門市需要開始</p>
              <h2 id="contact-title" className="mt-3 text-2xl font-semibold leading-snug sm:text-3xl">你的門市，從哪裡開始？</h2>
              <p className="mt-3 max-w-lg text-base leading-7 text-[#4C6259]">填寫門市需求，安排適合你的體驗內容。想先問問題，也可以直接聯繫我們。</p>
              <a href={LINE_URL} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center underline underline-offset-4">加 LINE 諮詢 ↗</a>
            </div>
            <div className="rounded-2xl bg-[#123E32] p-5 text-[#F8F5EE] sm:p-6">
              <p className="text-base">基本版・限時優惠</p>
              <p className="mt-3 text-base">每月 <span className="text-4xl font-semibold tracking-tight">NT$1,490</span></p>
              <p className="mt-5 text-base leading-7 text-[#D4E0D8]">三個付費方案皆內含 LINE 顧客入口（LIFF）；自動提醒等模組依方案選配。</p>
              <p className="mt-3 text-sm leading-7 text-[#D4E0D8]">主方案一次繳一年送 2 個月；額外加購模組與分店費另計。</p>
              <div className="mt-4"><ConsultLink light /></div>
              <Link href="/pricing" className="mt-5 inline-block py-2 text-base underline underline-offset-8">查看完整方案與加購說明</Link>
            </div>
          </div>
          <div className="mt-6 border-t border-[#153B31]/15 pt-8">
            <h3 className="text-xl font-semibold">店家常見問題</h3>
            <p className="mt-3 leading-8 text-[#4C6259]">從店家最常問的問題開始。</p>
            <div className="mt-6 divide-y divide-[#153B31]/15">
              {[
                ["一人店、兩人店適合用嗎？", "可以先從預約、顧客資料與堂數管理開始，依門市人數和實際需求選配功能。"],
                ["我不熟電腦，會不會很難學？", "先從查看預約、查詢顧客、完成服務等日常操作開始。免費介紹可帶你看操作，再確認是否適合店內流程。"],
                ["顧客需要另外下載 App 嗎？", "顧客可從店家 LINE 的顧客入口使用預約與會員功能，不需另外下載蒸管家 App；首次使用仍須完成必要授權與資料填寫。"],
                ["已經有官方 LINE，可以接著使用嗎？", "先確認現有官方 LINE 的設定與管理權限，再安排顧客入口串接。三個付費方案皆內含 LIFF 顧客入口，數位管家則需另行開通。"],
                ["原有顧客與剩餘堂數，要怎麼帶進來？", "先確認資料格式、方案期限與剩餘堂數，再安排建檔或評估匯入方式；核對完成後再開始使用。"],
                ["顧客預約後，我還要手動抄名單嗎？", "顧客完成預約後，名單與時段會進入後台，減少重複抄寫。單純在 LINE 私訊詢問，仍須完成預約流程。"],
                ["到店提醒、方案到期提醒都有嗎？", "可依門市功能與設定安排提醒。到店卡片可提供確認、改期或取消，方案到期卡片引導預約或諮詢店長；通知須完成 LINE 串接並啟用相關設定。"],
                ["月費之外，還有哪些費用？", "額外模組與分店費依選擇另計。主方案年繳送 2 個月，優惠範圍與內含項目可查看方案頁；LINE 訊息等第三方費用需另外確認。"],
                ["可以先看操作，再決定要不要用嗎？", "可以。點選「申請體驗帳號」，填寫門市需求後，由專人聯繫確認體驗內容與期限，再提供登入方式。也可以先加 LINE 預約免費介紹。"],
              ].map(([question, answer]) => <details key={question} name="business-faq" className="py-2">
                <summary className="cursor-pointer py-2 font-medium">{question}</summary>
                <p className="mt-2 leading-8 text-[#4C6259]">{answer}</p>
              </details>)}
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-[#153B31]/15 px-5 py-7 text-sm text-[#4C6259] sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4">
          <p>蒸管家｜每一家店都值得擁有一位數位管家。</p>
          <a href={TRIAL_URL} className="underline underline-offset-4">申請體驗帳號</a>
        </div>
      </footer>
    </div>
  );
}
