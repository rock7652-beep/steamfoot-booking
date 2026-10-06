import { HomepageOffer } from "../pricing-offer";
import { MarketingFaq } from "../marketing-faq";
import { StoreTestimonial } from "@/components/store-testimonial";
import { MarketingUsageStatistics } from "@/components/marketing-usage-statistics";
import { getMarketingUsage } from "@/lib/marketing-usage-server";
import { MarketingNavigation } from "@/components/marketing-navigation";
import { MarketingFooter } from "@/components/marketing-footer";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { BookingOverview } from "./booking-overview";
import { BookingTypes } from "../booking-types";

export const metadata: Metadata = {
  title: "蒸管家｜每一家店，都值得擁有一位數位管家",
  description: "預約、堂數、收款與顧客追蹤，集中管理。了解蒸管家如何協助預約制門市與工作室的日常營運。",
  robots: { index: false, follow: false },
};

const LINE_URL = "https://lin.ee/SGy5UBz";
const TRIAL_URL = "/apply";
function ConsultLink({ light = false }: { light?: boolean }) {
  return <a href={TRIAL_URL}
    className={`inline-flex min-h-12 items-center justify-center rounded-full px-6 py-3 text-center text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#B58C43] ${light ? "bg-[#F5EFE3] text-[#123E32] hover:bg-white" : "bg-[#123E32] text-white hover:bg-[#245A49]"}`}>
    申請 30 天免費體驗<span aria-hidden="true" className="ml-3">→</span>
  </a>;
}

export const revalidate = 3600;

export default async function BusinessPage() {
  const usage = await getMarketingUsage();
  // SSR timestamp is passed unchanged to the first client render.
  // eslint-disable-next-line react-hooks/purity
  const initialNow = Date.now();
  return (
    <div className="bg-[#F8F5EE] text-[#153B31] selection:bg-[#DFC99D]">
      <a href="#main" className="sr-only focus:not-sr-only focus:block focus:p-4">跳至主要內容</a>
      <MarketingNavigation />
      <main id="main">
        <section aria-labelledby="hero-title" className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
          <div className="space-y-4">
          <div>
            <h1 id="hero-title" className="text-[clamp(1.8rem,3.5vw,3rem)] font-semibold leading-[1.3] tracking-tight">
              <span className="block sm:inline">每一家店，</span>都值得擁有<span>一位<span className="text-[#967039]">數位管家</span>。</span>
            </h1>
            <p className="mt-3 text-lg font-medium leading-7 text-[#153B31] sm:text-xl">預約變簡單，顧客不用換習慣。</p>
              <p className="mt-2 max-w-2xl text-base leading-7 text-[#4C6259]">從熟悉的 LINE 開始，不用下載新 App，就能選擇服務與時間。</p>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <ConsultLink />
              <a href="#how-it-works" className="py-3 text-base underline underline-offset-8">看看怎麼運作</a>
            </div>
            <p className="mt-2 text-sm leading-6 text-[#4C6259]">填寫需求，由專人聯繫安排體驗。</p>
          </div>
          </div>
        </section>

        <MarketingUsageStatistics snapshot={usage} />
        <BookingOverview />
        <BookingTypes />
        <section aria-labelledby="inventory-title" className="mx-auto max-w-6xl px-5 py-7 sm:px-8"><div className="rounded-2xl border border-[#153B31]/15 bg-white p-5 sm:p-7"><p className="text-sm font-medium text-[#74603C]">店務管理</p><h2 id="inventory-title" className="mt-2 text-2xl font-semibold">進銷存管理</h2><p className="mt-3 text-base leading-7 text-[#4C6259]">商品、進貨、銷貨與庫存集中管理，銷售收款串接現金收支，減少重複登記。</p><p className="mt-3 text-sm leading-6 text-[#4C6259]">基本版可加購・專業版可選配・展店版內含</p><Link href="/pricing/features#inventory" className="mt-2 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">了解進銷存功能 →</Link></div></section>

        <section id="brands" aria-labelledby="cases-title" className="scroll-mt-24 border-y border-[#153B31]/15 bg-[#EEE9DD] px-5 py-7 sm:px-8 sm:py-8">
          <div className="mx-auto max-w-6xl">
            <p className="text-sm font-medium tracking-widest text-[#74603C]">真實店家，實際使用</p>
            <div className="mt-3 grid gap-4">
              <div><h2 id="cases-title" className="text-2xl font-semibold leading-snug">使用蒸管家的品牌</h2>
                
              </div>
              <div className="grid items-start gap-4 md:grid-cols-2">
                <article className="flex flex-col rounded-xl border border-[#153B31]/15 bg-white/60 p-5">
                  <p className="text-sm text-[#74603C]">案例 A・預約提醒</p>
                  <h3 className="mt-2 text-2xl font-medium">暖沐蒸足</h3>
                  <p className="mt-3 text-base font-medium leading-7">逐筆提醒的時間，交給蒸管家。</p>


                  <a href="/pricing/business-assets/brand-reminder-example.jpeg" target="_blank" rel="noopener noreferrer"
                    aria-label="放大暖沐預約提醒示意圖（另開視窗）"
                    className="mt-4 block rounded-xl border border-[#153B31]/15 bg-white p-3 focus-visible:outline-2 focus-visible:outline-offset-4">
                    <Image src="/pricing/business-assets/brand-reminder-example.jpeg" width={1058} height={1487} sizes="(min-width: 768px) 480px, 100vw"
                      alt="預約提醒示意卡片：林小姐的預約資訊、改時段與取消選項"
                      className="mx-auto h-64 w-full rounded-md object-contain sm:h-80" />
                    <span className="mt-3 block text-center text-sm leading-6 text-[#4C6259]">提醒卡片示意・點圖放大</span>
                  </a>
                  <a href="/cases?store=nuanmu" className="mt-4 inline-flex min-h-12 items-center text-base font-medium underline underline-offset-4">查看暖沐完整案例 →</a>
                </article>
                <article className="flex flex-col rounded-xl border border-[#153B31]/15 bg-white/60 p-5">
                  <p className="text-sm text-[#74603C]">案例 B・體驗預約</p>
                  <h3 className="mt-2 text-2xl font-medium">暖暖蒸足</h3>

                  <p className="mt-3 text-base font-medium leading-7">少一些來回確認，少一次重複建檔。</p>
                  <p className="mt-2 text-base leading-7 text-[#4C6259]">顧客自行選時段，送出後自動建檔與排入預約，再透過 LINE 通知店長。</p>

                  <a href="/pricing/business-assets/booking-time-original.png" target="_blank" rel="noopener noreferrer" aria-label="放大暖暖蒸足預約畫面（另開視窗）" className="mt-4 block rounded-xl border border-[#153B31]/15 bg-white p-3 focus-visible:outline-2 focus-visible:outline-offset-4">
                    <Image src="/pricing/business-assets/booking-time-original.png" width={1532} height={1364} sizes="(min-width: 768px) 480px, 100vw" alt="暖暖蒸足真實預約畫面：顧客自行選擇日期與時段" className="mx-auto h-64 w-full object-contain sm:h-80" />
                    <span className="mt-3 block text-center text-sm leading-6 text-[#4C6259]">真實預約畫面・點圖放大</span>
                  </a>
                  <Link href="/cases?store=nuannuan" className="mt-4 inline-flex min-h-12 items-center text-base font-medium underline underline-offset-4">查看暖暖完整案例 →</Link>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section id="testimonials" aria-labelledby="testimonials-title" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-7 sm:px-8">
          <div className="grid items-center gap-5 lg:grid-cols-[minmax(240px,0.55fr)_1fr] lg:gap-8">
            <div>
              <p className="text-sm font-medium text-[#74603C]">店家使用心得</p>
              <h2 id="testimonials-title" className="mt-2 text-2xl font-semibold leading-snug sm:text-3xl">每天在用的店長，<br className="hidden sm:block" />怎麼說？</h2>
              <p className="mt-3 max-w-xs text-base leading-7 text-[#4C6259]">從現場的日常安排，聽聽店長的實際感受。</p>
            </div>
            <StoreTestimonial />
          </div>
        </section>

        <section aria-labelledby="guides-title" className="mx-auto max-w-6xl px-5 py-7 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="guides-title" className="text-2xl font-semibold">店長經營指南</h2>
              <p className="mt-2 text-base leading-7 text-[#4C6259]">一個人顧店，預約怎麼排？每天開店先看什麼？這裡有可以照做的小方法。</p>
            </div>
            <Link href="/guides" className="inline-flex min-h-12 items-center text-base font-medium underline underline-offset-4">閱讀店長實用指南 →</Link>
          </div>
        </section>

        <section id="trial" aria-labelledby="contact-title" className="mx-auto max-w-6xl px-5 py-7 sm:px-8 sm:py-8">
          <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr] lg:items-center">
            <div>
              <p className="text-sm font-medium text-[#74603C]">從你的門市需要開始</p>
              <h2 id="contact-title" className="mt-2 text-2xl font-semibold leading-snug sm:text-3xl">先免費用 30 天，再決定。</h2>
              <p className="mt-3 max-w-lg text-base leading-7 text-[#4C6259]">單店功能完整體驗，專人協助上手。轉正式資料可沿用。</p>
              <div className="mt-4"><ConsultLink /></div>
              <ol aria-label="體驗申請流程" className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-base leading-7">
                <li>填寫需求</li>
                <li><span aria-hidden="true" className="mr-2 text-[#967039]">→</span>專人協助設定</li>
                <li><span aria-hidden="true" className="mr-2 text-[#967039]">→</span>開始體驗</li>
              </ol>
              <p className="mt-2 text-sm leading-6 text-[#4C6259]">可正常使用才起算 30 天，申請不扣款。</p>
              <a href={LINE_URL} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center text-base underline underline-offset-4">加 LINE 諮詢 ↗</a>
            </div>
            <HomepageOffer initialNow={initialNow} />
          </div>
          <MarketingFaq />
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
