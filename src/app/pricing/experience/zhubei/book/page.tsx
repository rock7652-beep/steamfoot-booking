import type { Metadata } from "next";
import Image from "next/image";
import { ZhubeiTrialBookingForm } from "./zhubei-trial-booking-form";

const lineUrl = "https://lin.ee/Nki2OjA";
const mapUrl =
  "https://www.google.com/maps/search/?api=1&query=" +
  encodeURIComponent("新竹縣竹北市科大一路80號");

export const metadata: Metadata = {
  title: "竹北首次蒸足體驗 NT$499｜暖暖蒸足線上預約",
  description:
    "暖暖蒸足竹北店公開預約。直接選日期、時段與人數，不用註冊、不用設密碼，到店再付款。",
  openGraph: {
    title: "竹北首次蒸足體驗 NT$499｜暖暖蒸足",
    description: "真實門市、線上選時段，到店再付款。約 45 分鐘，1–4 人皆可預約。",
    images: ["/images/zhubei/trial-booking-interior.webp"],
  },
};

const trustItems = [
  { title: "不用註冊", detail: "免帳號、免密碼" },
  { title: "直接選時段", detail: "送出即建立預約" },
  { title: "到店再付款", detail: "每人 NT$499" },
  { title: "可預約 1–4 人", detail: "朋友家人一起來" },
];

export default function ZhubeiTrialBookingPage() {
  return (
    <main className="min-h-dvh bg-[#f7f2ea] pb-12 text-earth-900">
      <section className="mx-auto max-w-3xl overflow-hidden bg-white shadow-sm sm:mt-8 sm:rounded-[2rem]">
        <div className="relative aspect-[4/3] min-h-[360px] overflow-hidden sm:aspect-[16/10]">
          <Image
            src="/images/zhubei/trial-booking-interior.webp"
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
              第一次來，
              <br />
              也能輕鬆完成預約
            </h1>
            <div className="mt-4 flex flex-wrap items-end gap-x-3 gap-y-1">
              <span className="text-sm text-white/75 line-through">原價 NT$799</span>
              <span className="text-2xl font-bold">首次體驗 NT$499</span>
            </div>
            <p className="mt-2 text-sm text-white/85">約 45 分鐘・不用先購買正式方案・到店再付款</p>
            <a
              href="#booking-form"
              className="mt-5 flex h-12 w-full items-center justify-center rounded-2xl bg-white px-5 text-base font-semibold text-primary-700 shadow-lg sm:w-fit sm:min-w-48"
            >
              查看可預約時段
            </a>
          </div>
        </div>

        <div className="px-4 py-6 sm:px-10 sm:py-9">
          <section aria-label="預約特色" className="grid grid-cols-2 gap-3">
            {trustItems.map((item) => (
              <div key={item.title} className="rounded-2xl border border-earth-100 bg-[#fcfaf7] p-4">
                <p className="font-semibold text-earth-900">{item.title}</p>
                <p className="mt-1 text-xs leading-5 text-earth-500">{item.detail}</p>
              </div>
            ))}
          </section>

          <section className="mt-8 rounded-3xl bg-primary-50/70 p-5 sm:p-6">
            <p className="text-xs font-semibold tracking-[0.16em] text-primary-700">第一次蒸足也不用擔心</p>
            <h2 className="mt-2 text-xl font-bold text-earth-900">從線上預約到到店，只要四個步驟</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {[
                ["1", "選日期與時段", "查看門市即時可約時間"],
                ["2", "選擇同行人數", "單次可預約 1–4 人"],
                ["3", "留下姓名與手機", "不用註冊會員帳號"],
                ["4", "到店由夥伴協助", "約 45 分鐘，到店再付款"],
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
            <ZhubeiTrialBookingForm />
          </section>

          <section className="mt-10 overflow-hidden rounded-3xl border border-earth-100 bg-white">
            <div className="relative aspect-[4/3] overflow-hidden">
              <Image
                src="/images/zhubei/trial-booking-storefront.webp"
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
              立即選擇日期與時段
            </a>
          </section>
        </div>
      </section>
    </main>
  );
}
