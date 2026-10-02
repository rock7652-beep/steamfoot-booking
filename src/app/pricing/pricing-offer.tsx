"use client";

import { useEffect, useState } from "react";
import { getPublicPricingOffer, PUBLIC_PRICING_PLANS } from "@/lib/public-pricing-offer";
import { MarketingIcon } from "./marketing-icon";

function useOffer(initialNow: number) {
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 1000);
    window.addEventListener("pageshow", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pageshow", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return getPublicPricingOffer(now);
}
const money = (amount: number) => amount.toLocaleString("zh-TW");

export function PricingOffer({ initialNow, trialUrl }: { initialNow: number; trialUrl: string }) {
  const offer = useOffer(initialNow);
  return <>
    {offer.active && <section aria-labelledby="yearend-offer" className="mb-5 overflow-hidden rounded-2xl bg-[#123E32] px-5 py-6 text-white sm:px-7">
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
        <div>
          <p className="text-sm font-semibold tracking-widest text-[#ECD5A4]">2026 年底前限定優惠</p>
          <h2 id="yearend-offer" className="mt-2 text-2xl font-semibold leading-snug sm:text-3xl">年繳 12 個月<span className="block text-[#ECD5A4] sm:ml-3 sm:inline">再送 2 個月</span></h2>
          <p className="mt-2 text-base text-[#E0E9E3]">同樣年繳費用，享 12＋2 個月使用。</p>
        </div>
        <div className="shrink-0">
          <p className="mb-2 text-sm text-[#E0E9E3]">優惠倒數</p>
          <div role="timer" aria-label="距離年底付款優惠截止" aria-live="off" className="flex gap-2">
            {offer.countdown.map((value, index) => <div key={index} className="min-w-0 flex-1 rounded-lg border border-[#ECD5A4]/30 bg-white/5 px-3 py-2 text-center sm:min-w-16">
              <span className="block text-3xl font-semibold tabular-nums text-[#ECD5A4]">{String(value).padStart(2, "0")}</span>
              <span className="mt-1 block text-sm text-[#E0E9E3]">{["天", "時", "分", "秒"][index]}</span>
            </div>)}
          </div>
        </div>
      </div>
      <p className="mt-4 border-t border-white/15 pt-3 text-sm leading-6 text-[#E0E9E3]">2026/12/31 23:59:59 前完成付款（台灣時間），自正式啟用日起享 14 個月。</p>
    </section>}
    <section aria-label="方案價格" className="grid gap-4 lg:grid-cols-3">
      {PUBLIC_PRICING_PLANS.map(plan => <article key={plan.id} aria-labelledby={plan.id} className={"flex flex-col rounded-2xl border p-5 sm:p-6 " + (plan.id === "GROWTH" ? "border-[#123E32]/40 bg-[#E9F1EB]" : "border-[#153B31]/20 bg-white")}>
        <h2 id={plan.id} className="flex items-center gap-3 text-xl font-semibold"><MarketingIcon kind={plan.icon} />{plan.name}</h2>
        <p className="mt-2 text-lg font-medium">{plan.purpose}</p>
        <p className="mt-1 text-base leading-6 text-[#4C6259]">適合{plan.audience}</p>
        <div className="mt-4 border-t border-[#153B31]/15 pt-4">
          <p className="text-sm text-[#64756D] line-through">原價 NT${plan.original}／月{plan.id === "ALLIANCE" ? "起" : ""}</p>
          <p className="mt-3 text-sm font-medium text-[#4C6259]">年繳換算・平均每月{offer.active ? "約" : ""}</p>
          <p className="mt-1 whitespace-nowrap"><span className="text-4xl font-semibold tracking-tight">NT${money(Math.round(plan.annual / offer.months))}</span><span className="ml-1 text-base">／月{plan.id === "ALLIANCE" ? "起" : ""}</span></p>
          <p className="mt-3 text-base font-semibold">年繳 NT${money(plan.annual)}{plan.id === "ALLIANCE" ? "起" : ""}<span className="block text-sm font-normal text-[#4C6259]">一次繳清</span></p>
          <p className="mt-3 rounded-lg border border-[#C39A51]/30 bg-[#FBF4E5] px-3 py-2 text-base font-semibold text-[#59441E]">{offer.active ? <>12 個月<span className="ml-1 text-[#805C1B]">＋贈送 2 個月</span></> : "使用 12 個月"}</p>
        </div>
        <ul className="my-4 space-y-2 text-sm leading-6">{plan.benefits.map(benefit => <li key={benefit} className="flex gap-2"><span aria-hidden="true" className="font-semibold text-[#805C1B]">✓</span><span>{benefit}</span></li>)}</ul>
        {plan.id === "ALLIANCE" && <p className="mb-4 text-sm leading-6 text-[#4C6259]">串接費依實際分店數另計；各分店系統月費另計。</p>}
        <a href={trialUrl} className="mt-auto inline-flex min-h-11 items-center justify-center rounded-full bg-[#123E32] px-5 py-3 text-base font-semibold text-white hover:bg-[#245A49] focus-visible:outline-2 focus-visible:outline-offset-4">申請體驗帳號<span aria-hidden="true" className="ml-2">→</span></a>
      </article>)}
    </section>
    <p className="mt-3 text-sm leading-6 text-[#4C6259]">平均月費依年繳總額 ÷ {offer.months} 個月{offer.active ? "計算，四捨五入至整元" : "計算"}，採一次年繳。使用期間自正式啟用日起算。LINE 訊息、金流、加購功能與分店相關費用另計，開通前確認。</p>
  </>;
}
export function PricingOfferTerms({ initialNow }: { initialNow: number }) {
  const offer = useOffer(initialNow);
  return <>{offer.active ? "2026/12/31 前完成付款，主方案年繳 12 個月＋贈送 2 個月，自正式啟用日起享 14 個月。2027/01/01 起取消贈送 2 個月，年繳金額不變，使用期間為 12 個月。" : "主方案採一次年繳，自正式啟用日起使用 12 個月；年底贈送 2 個月活動已結束，年繳金額不變。"}</>;
}
