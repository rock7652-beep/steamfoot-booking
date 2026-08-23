import type { Metadata } from "next";
import Image from "next/image";
import interiorImage from "../../../../../../public/images/zhubei/trial-booking-interior.webp";
import storefrontImage from "../../../../../../public/images/zhubei/trial-booking-storefront.webp";
import { ZhubeiTrialBookingForm } from "./zhubei-trial-booking-form";

const lineUrl = "https://lin.ee/Nki2OjA";
const mapUrl = "https://maps.app.goo.gl/hD7Mkc78NCakz3M9A?g_st=ic";

export const metadata: Metadata = {
  title: "竹北首次蒸足體驗 NT$499｜暖暖蒸足線上預約",
  description:
    "暖暖蒸足竹北店公開預約。直接選日期、時段與人數，不用註冊、不用設密碼，到店再付款。",
  openGraph: {
    title: "竹北首次蒸足體驗 NT$499｜暖暖蒸足",
    description: "真實門市、線上選時段，到店再付款。約 45 分鐘，1–2 人皆可預約。",
    images: ["/images/zhubei/trial-booking-interior.webp"],
  },
};

const firstVisitItems = [
  {
    title: "可依預約時間提早 10 分鐘抵達門市",
    detail: "提早抵達即可，由店長協助報到。",
  },
  {
    title: "由門市店長說明流程",
    detail: "第一次體驗不用擔心，店長會一步一步協助。",
  },
  {
    title: "完成約 45 分鐘的蒸足體驗",
    detail: "請替自己保留充裕時間，放慢步調感受整個過程。",
  },
  {
    title: "體驗結束後再完成付款",
    detail: "首次體驗每人 NT$499，不需要先購買正式方案。",
  },
];

const faqItems = [
  {
    question: "第一次來，需要先加入會員嗎？",
    answer: "不需要。直接在這一頁選日期、時段、人數，留下姓名與手機即可完成預約。",
  },
  {
    question: "一次可以預約幾個人？",
    answer: "一次可預約 1–2 人；系統會依照該時段剩餘名額提供可選人數。",
  },
  {
    question: "體驗大約需要多久？",
    answer: "首次蒸足體驗約 45 分鐘，建議另外保留抵達、說明與付款的時間。",
  },
  {
    question: "預約後需要先付款嗎？",
    answer: "不用。預約成功後，依約到竹北店完成體驗，再由門市店長協助付款。",
  },
  {
    question: "送出後，怎麼知道有沒有預約成功？",
    answer: "頁面會顯示預約成功資訊，同時系統會直接在竹北店後台建立首次體驗預約。",
  },
  {
    question: "有特殊健康狀況，也可以預約嗎？",
    answer: "如有懷孕、慢性病、近期手術或其他需要留意的狀況，建議預約前先透過官方 LINE 詢問，必要時先諮詢專業醫療人員。",
  },
];

export default async function ZhubeiTrialBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ entry?: string | string[] }>;
}) {
  const params = await searchParams;
  const entry = typeof params.entry === "string" ? params.entry : undefined;
  return (
    <main className="min-h-dvh bg-[#f7f2ea] pb-28 text-earth-900 sm:pb-12">
      <section className="mx-auto max-w-3xl overflow-hidden bg-white shadow-sm sm:mt-8 sm:rounded-[2rem]">
        <div className="relative aspect-[4/3] min-h-[360px] overflow-hidden sm:aspect-[16/10]">
          <Image
            src={interiorImage}
            alt="暖暖蒸足竹北店真實服務現場"
            fill
            priority
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-10">
            <p className="text-sm font-medium tracking-[0.16em] text-white/85">暖暖蒸足｜竹北店</p>
            <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
              第一次來暖暖蒸足，
              <br />
              從這裡開始
            </h1>
            <div className="mt-4 flex flex-wrap items-end gap-x-3 gap-y-1">
              <span className="text-sm text-white/75 line-through">原價 NT$799</span>
              <span className="text-2xl font-bold">首次體驗 NT$499</span>
            </div>
            <p className="mt-2 text-sm text-white/85">約 45 分鐘・不用先購買正式方案・到店再付款</p>
            <a
              href="#booking-form"
              className="mt-5 flex h-12 w-full items-center justify-center rounded-2xl bg-white px-5 text-base font-semibold text-primary-700 shadow-lg sm:w-fit sm:min-w-56"
            >
              立即預約首次體驗
            </a>
          </div>
        </div>

        <div className="px-4 py-6 sm:px-10 sm:py-9">
          <section className="rounded-3xl bg-primary-50/70 p-5 sm:p-6">
            <p className="text-xs font-semibold tracking-[0.16em] text-primary-700">第一次蒸足也不用擔心</p>
            <h2 className="mt-2 text-xl font-bold text-earth-900">從線上預約到到店，只要四個步驟</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {[
                ["1", "選日期與時段", "查看門市即時可約時間"],
                ["2", "選擇同行人數", "單次可預約 1–2 人"],
                ["3", "留下姓名與手機", "不用註冊會員帳號"],
                ["4", "到店由店長協助", "約 45 分鐘，到店再付款"],
              ].map(([number, title, detail]) => (
                <div key={number} className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-600 text-sm font-bold text-white">
                    {number}
                  </span>
                  <div>
                    <p className="font-semibold text-earth-900">{title}</p>
                    <p className="mt-0.5 text-sm leading-5 text-earth-500">{detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section id="booking-form" className="scroll-mt-5 pt-9">
            <div className="text-center">
              <p className="text-sm font-semibold text-primary-700">立即查看可預約時間</p>
              <h2 className="mt-2 text-2xl font-bold">選好時間，就完成預約</h2>
              <p className="mt-2 text-sm leading-6 text-earth-500">
                送出成功後，系統會直接在竹北店後台建立首次體驗預約。
              </p>
            </div>
            <ZhubeiTrialBookingForm entry={entry} />
          </section>

          <section id="first-visit-guide" className="mt-10 scroll-mt-5 rounded-3xl bg-[#fcfaf7] p-5 sm:p-7">
            <p className="text-sm font-semibold text-primary-700">第一次來會發生什麼？</p>
            <h2 className="mt-2 text-2xl font-bold">從進門到離開，都有店長陪你完成</h2>
            <div className="mt-6 space-y-5">
              {firstVisitItems.map((item, index) => (
                <div key={item.title} className="flex gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-earth-900 text-sm font-bold text-white">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold text-earth-900">{item.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-earth-500">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-10">
            <div className="text-center">
              <p className="text-sm font-semibold text-primary-700">預約前常見問題</p>
              <h2 className="mt-2 text-2xl font-bold">把第一次來的疑問先回答清楚</h2>
            </div>
            <div className="mt-5 space-y-3">
              {faqItems.map((item) => (
                <details key={item.question} className="group rounded-2xl border border-earth-100 bg-white px-5 py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-earth-900">
                    <span>{item.question}</span>
                    <span className="text-xl font-normal text-primary-700 transition-transform group-open:rotate-45">＋</span>
                  </summary>
                  <p className="mt-3 pr-8 text-sm leading-6 text-earth-500">{item.answer}</p>
                </details>
              ))}
            </div>
            <p className="mt-4 text-center text-sm text-earth-500">
              還有其他問題？
              <a href={lineUrl} target="_blank" rel="noreferrer" className="ml-1 font-semibold text-primary-700 underline underline-offset-4">
                先用官方 LINE 詢問
              </a>
            </p>
          </section>

          <section className="mt-10 overflow-hidden rounded-3xl border border-earth-100 bg-white">
            <div className="relative aspect-[4/3] overflow-hidden">
              <Image
                src={storefrontImage}
                alt="暖暖蒸足竹北店門市外觀"
                fill
                sizes="(max-width: 768px) 100vw, 640px"
                className="object-cover"
              />
            </div>
            <div className="p-5 sm:p-6">
              <p className="text-sm font-semibold text-primary-700">實際門市外觀</p>
              <h2 className="mt-2 text-xl font-bold">暖暖蒸足｜竹北店</h2>
              <p className="mt-2 text-sm leading-6 text-earth-600">新竹縣竹北市科大一路80號</p>
              <p className="mt-1 text-xs leading-5 text-earth-500">抵達時請認明 steam spa 暖暖蒸足招牌。</p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-11 items-center justify-center rounded-xl bg-primary-600 text-sm font-semibold text-white"
                >
                  開啟地圖導航
                </a>
                <a
                  href={lineUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-11 items-center justify-center rounded-xl border border-primary-200 text-sm font-semibold text-primary-700"
                >
                  聯繫官方 LINE
                </a>
              </div>
            </div>
          </section>

          <section className="mt-8 rounded-3xl bg-earth-900 p-6 text-center text-white">
            <p className="text-sm text-white/70">首次體驗每人 NT$499</p>
            <h2 className="mt-2 text-xl font-bold">選一個適合你的時間，來感受 45 分鐘的溫暖放鬆</h2>
            <a
              href="#booking-form"
              className="mt-5 flex h-12 items-center justify-center rounded-2xl bg-white text-base font-semibold text-earth-900"
            >
              立即預約首次體驗
            </a>
          </section>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-earth-100 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(57,45,36,0.12)] backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-md items-center gap-4">
          <div className="shrink-0">
            <p className="text-[11px] text-earth-500">首次體驗／人</p>
            <p className="text-lg font-bold text-earth-900">NT$499</p>
          </div>
          <a
            href="#booking-form"
            className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-primary-600 px-5 text-base font-semibold text-white shadow-sm"
          >
            立即預約
          </a>
        </div>
      </div>
    </main>
  );
}
