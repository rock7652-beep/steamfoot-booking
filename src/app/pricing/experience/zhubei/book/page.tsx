import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { ZhubeiTrialBookingForm } from "./zhubei-trial-booking-form";

export const metadata: Metadata = {
  title: "竹北蒸足首次體驗 NT$499｜暖暖蒸足",
  description: "暖暖蒸足竹北店公開預約。免註冊、到店付款，約 45 分鐘，立即選擇日期與時段。",
};

const photoSprite = "/images/zhubei/trial-sprite.jpg";
const lineUrl = "https://lin.ee/Nki2OjA";
const mapUrl =
  "https://www.google.com/maps/search/?api=1&query=" +
  encodeURIComponent("新竹縣竹北市科大一路80號");

function photoStyle(position: "top" | "center" | "bottom"): CSSProperties {
  return {
    backgroundImage: `url(${photoSprite})`,
    backgroundRepeat: "no-repeat",
    backgroundSize: "100% 300%",
    backgroundPosition: position,
  };
}

export default function ZhubeiTrialBookingPage() {
  return (
    <main className="min-h-dvh bg-[#f7f2eb] pb-12 text-earth-900">
      <div className="mx-auto max-w-md overflow-hidden bg-[#fbf8f3] shadow-sm sm:my-6 sm:rounded-[28px]">
        <section className="relative">
          <div
            className="h-[310px] bg-cover bg-center"
            style={photoStyle("top")}
            role="img"
            aria-label="暖暖蒸足竹北店實際蒸足體驗現場"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-5 pb-6 pt-20 text-white">
            <p className="text-sm font-semibold tracking-wide">暖暖蒸足｜竹北店</p>
            <h1 className="mt-2 text-[28px] font-bold leading-tight">第一次蒸足，輕鬆從這裡開始</h1>
            <p className="mt-3 text-sm leading-6 text-white/90">不用註冊、不用設密碼，選好時間就完成預約。</p>
          </div>
        </section>

        <section className="px-4 pb-2 pt-5">
          <div className="rounded-2xl border border-primary-100 bg-white px-5 py-5 text-center shadow-sm">
            <p className="text-xs font-medium tracking-[0.18em] text-primary-700">首次體驗限定</p>
            <div className="mt-2 flex items-end justify-center gap-2">
              <span className="text-sm text-earth-400 line-through">原價 NT$799</span>
              <span className="text-3xl font-bold text-primary-700">NT$499</span>
              <span className="pb-1 text-sm text-earth-500">／人</span>
            </div>
            <p className="mt-3 text-sm text-earth-600">約 45 分鐘・到店付款・不用先購買正式方案</p>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              ["✓", "真實門市", "看得到現場"],
              ["✓", "快速預約", "約 1 分鐘完成"],
              ["✓", "安心體驗", "夥伴現場協助"],
            ].map(([icon, title, detail]) => (
              <div key={title} className="rounded-2xl bg-white px-2 py-4 shadow-sm">
                <div className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-primary-50 text-sm font-bold text-primary-700">{icon}</div>
                <p className="mt-2 text-sm font-semibold text-earth-800">{title}</p>
                <p className="mt-1 text-[11px] leading-4 text-earth-500">{detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl bg-[#efe7dd] px-4 py-4">
            <p className="text-sm font-semibold text-earth-800">第一次來，不用擔心流程</p>
            <p className="mt-2 text-sm leading-6 text-earth-600">到店後由門市夥伴協助入座與操作。穿著輕鬆即可，預約完成前不需要付款，也不會要求加入正式方案。</p>
          </div>

          <ZhubeiTrialBookingForm />
        </section>

        <section className="mt-8 bg-white px-4 py-7">
          <p className="text-center text-xs font-medium tracking-[0.18em] text-primary-700">真實服務現場</p>
          <h2 className="mt-2 text-center text-xl font-bold">不是素材照，就是你將抵達的地方</h2>
          <div
            className="mt-5 h-56 rounded-2xl bg-cover bg-center shadow-sm"
            style={photoStyle("bottom")}
            role="img"
            aria-label="暖暖蒸足竹北店夥伴與顧客合照"
          />
          <p className="mt-4 text-center text-sm leading-6 text-earth-600">親切的門市夥伴會在現場協助你完成整個體驗流程。</p>
        </section>

        <section className="px-4 py-7">
          <div
            className="h-52 rounded-2xl bg-cover bg-center shadow-sm"
            style={photoStyle("center")}
            role="img"
            aria-label="暖暖蒸足竹北店門市外觀"
          />
          <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-xs font-medium tracking-[0.18em] text-primary-700">門市資訊</p>
            <h2 className="mt-2 text-lg font-bold">暖暖蒸足｜竹北店</h2>
            <p className="mt-2 text-sm leading-6 text-earth-600">新竹縣竹北市科大一路80號</p>
            <p className="mt-1 text-xs text-earth-500">抵達時請認明「steam spa 暖暖蒸足」招牌。</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <a href={mapUrl} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center rounded-xl border border-earth-200 text-sm font-semibold text-earth-700">開啟導航</a>
              <a href={lineUrl} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center rounded-xl border border-primary-200 text-sm font-semibold text-primary-700">官方 LINE</a>
            </div>
          </div>
        </section>

        <div className="px-4 pb-8 text-center text-xs leading-5 text-earth-400">
          線上送出成功後，系統會直接為你建立竹北店首次體驗預約。
        </div>
      </div>
    </main>
  );
}
