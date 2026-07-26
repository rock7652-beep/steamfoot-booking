import Link from "next/link";
import { ExperienceAttributionCapture } from "@/components/experience-attribution-capture";

export const metadata = {
  title: "竹北蒸足體驗｜暖暖蒸足",
  description: "暖暖蒸足竹北店，蒸足原價 NT$799，首次體驗 NT$499，約 45 分鐘。",
};

const lineUrl = "https://lin.ee/Nki2OjA";
const bookingUrl = "/pricing/experience/zhubei/book";
const mapUrl = "https://www.google.com/maps/search/?api=1&query=" +
  encodeURIComponent("新竹縣竹北市科大一路80號");

export default function ZhubeiExperiencePage() {
  return (
    <main className="min-h-dvh bg-[#fbf8f3] text-earth-900">
      <ExperienceAttributionCapture storeSlug="zhubei" />

      <section className="mx-auto max-w-md px-5 pb-10 pt-8">
        <p className="text-sm font-medium tracking-wide text-primary-700">暖暖蒸足｜竹北店</p>
        <h1 className="mt-3 text-3xl font-bold leading-tight">
          給自己 45 分鐘，<br />好好放鬆一下
        </h1>
        <p className="mt-5 text-base leading-7 text-earth-600">
          如果最近常覺得手腳冰冷、身體疲勞，或晚上不容易放鬆，歡迎來暖暖蒸足坐一坐。
        </p>
        <p className="mt-3 text-base leading-7 text-earth-600">
          第一次來也不用擔心，門市夥伴會陪你了解流程，讓你舒服完成這次體驗。
        </p>

        <div className="mt-6 rounded-2xl border border-primary-100 bg-white p-5 shadow-sm">
          <p className="text-sm text-earth-500">蒸足原價 <span className="line-through">NT$799</span></p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-primary-700">首次體驗</p>
              <p className="text-3xl font-bold text-primary-700">NT$499</p>
            </div>
            <p className="pb-1 text-sm text-earth-500">約 45 分鐘</p>
          </div>
        </div>

        <Link
          href={bookingUrl}
          className="mt-5 flex h-12 w-full items-center justify-center rounded-xl bg-primary-600 px-5 text-base font-semibold text-white shadow-sm hover:bg-primary-700"
        >
          預約首次體驗
        </Link>
        <p className="mt-2 text-center text-xs text-earth-400">不用註冊、不用設密碼，到店後再付款</p>
      </section>

      <section className="border-y border-earth-100 bg-white">
        <div className="mx-auto max-w-md px-5 py-10">
          <h2 className="text-xl font-bold">最近的你，也有這些感覺嗎？</h2>
          <div className="mt-5 grid gap-3">
            {["手腳容易冰冷", "工作後總是很疲勞", "晚上不容易放鬆"].map((item) => (
              <div key={item} className="rounded-xl bg-earth-50 px-4 py-4 text-sm font-medium">
                <span className="mr-2 text-primary-600">✓</span>{item}
              </div>
            ))}
          </div>
          <p className="mt-5 text-sm leading-6 text-earth-500">
            暖暖蒸足不是運動課程，你只需要坐下來，舒服地享受這段時間。
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-md px-5 py-10">
        <h2 className="text-xl font-bold">第一次蒸足，也可以很放心</h2>
        <ol className="mt-5 space-y-4">
          {[
            "門市夥伴簡單了解你的狀況",
            "協助你開始蒸足體驗",
            "安心休息約 45 分鐘",
            "體驗後關心你的感受",
          ].map((item, index) => (
            <li key={item} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700">
                {index + 1}
              </span>
              <span className="pt-0.5 text-sm leading-6 text-earth-700">{item}</span>
            </li>
          ))}
        </ol>
        <p className="mt-5 rounded-xl bg-white p-4 text-sm leading-6 text-earth-500 shadow-sm">
          可以喝水、聊天、滑手機，也可以單純閉眼休息。
        </p>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-md px-5 py-10">
          <h2 className="text-xl font-bold">真實顧客的感受</h2>
          <div className="mt-5 space-y-3">
            {[
              "是一個可以讓人放鬆舒壓的地方。",
              "每個人都很親切，蒸足也能舒服流汗。",
              "可以陪媽媽一起來，感覺很溫暖。",
            ].map((review) => (
              <blockquote key={review} className="rounded-xl border border-earth-100 p-4 text-sm leading-6 text-earth-600">
                「{review}」
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-md px-5 py-10">
        <h2 className="text-xl font-bold">竹北店體驗資訊</h2>
        <dl className="mt-5 space-y-3 rounded-2xl bg-white p-5 text-sm shadow-sm">
          <div className="flex justify-between gap-4"><dt className="text-earth-500">體驗</dt><dd className="font-medium">首次蒸足體驗</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-earth-500">原價</dt><dd className="font-medium line-through">NT$799</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-earth-500">體驗價</dt><dd className="font-medium text-primary-700">NT$499</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-earth-500">時間</dt><dd className="font-medium">約 45 分鐘</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-earth-500">地址</dt><dd className="text-right font-medium">新竹縣竹北市科大一路 80 號</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-earth-500">停車</dt><dd className="font-medium">周邊路邊停車格</dd></div>
        </dl>
        <a href={mapUrl} target="_blank" rel="noreferrer" className="mt-4 flex h-11 items-center justify-center rounded-xl border border-earth-200 bg-white text-sm font-medium text-earth-700">
          開啟地圖導航
        </a>
      </section>

      <section className="border-t border-earth-100 bg-white px-5 py-8">
        <div className="mx-auto max-w-md">
          <p className="text-center text-lg font-bold">準備好給自己 45 分鐘了嗎？</p>
          <Link href={bookingUrl} className="mt-4 flex h-12 items-center justify-center rounded-xl bg-primary-600 text-base font-semibold text-white">
            預約首次體驗 NT$499
          </Link>
          <a href={lineUrl} target="_blank" rel="noreferrer" className="mt-3 flex h-11 items-center justify-center rounded-xl border border-primary-200 text-sm font-medium text-primary-700">
            我想先用 LINE 詢問
          </a>
        </div>
      </section>
    </main>
  );
}
